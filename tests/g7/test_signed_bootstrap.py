"""Real disposable Ed25519/USTAR tests. Not production or Cell qualification."""
import base64
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import stat
from types import SimpleNamespace
import time
import unittest
from unittest.mock import call, patch
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

REPO = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('signed_bootstrap', REPO / 'tools/g7-signed-bootstrap.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
m.TRUSTED = REPO / 'specs'


def key():
    k = Ed25519PrivateKey.generate()
    raw = k.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    return k, m.digest(raw), base64.b64encode(raw).decode()


def sign(value, domain, k):
    return {'algorithm': 'ed25519', 'keyId': k[1],
            'signature': base64.b64encode(k[0].sign(domain.encode() + b'\n' + m.canonical(value))).decode()}


def header(name, size, kind=b'0'):
    h = bytearray(512)
    h[:len(name)] = name.encode()
    def octal(start, width, number):
        h[start:start + width] = (format(number, 'o').rjust(width - 1, '0') + '\0').encode()
    for at, width, value in [(100, 8, 0o600), (108, 8, 0), (116, 8, 0), (124, 12, size), (136, 12, 0)]:
        octal(at, width, value)
    h[148:156] = b' ' * 8
    h[156:157] = kind
    h[257:265] = b'ustar\x0000'
    octal(148, 8, sum(h))
    return bytes(h)


def tar(entries):
    return b''.join(header(p, len(b)) + b + b'\0' * ((-len(b)) % 512) for p, b in entries) + b'\0' * 1024


class SignedDispatch(unittest.TestCase):
    # No keys, signing or transport fixtures for unsupported dispatch.
    def test_unsupported_launch_rejected_before_operator_or_candidate_io(self):
        for operation in ['admin', 'install-service']:
            with self.subTest(operation=operation), \
                    patch.object(m, 'operator_json', side_effect=AssertionError('operator input reached')) as operator, \
                    patch.object(m, 'Archive', side_effect=AssertionError('archive reached')) as archive, \
                    patch.object(m, 'inspect') as inspect, \
                    patch.object(m, 'launch') as launch, \
                    patch.object(m.os, 'execve') as execute:
                with self.assertRaisesRegex(ValueError, 'unsupported launch operation; supported: prepare\\|owned'):
                    m.main(['launch', '/not-read', 'not-a-pin', '/trust-not-read',
                            '/floor-not-read', '/extracted-not-read', operation, 'request'])
                operator.assert_not_called()
                archive.assert_not_called()
                inspect.assert_not_called()
                launch.assert_not_called()
                execute.assert_not_called()

    def test_direct_unsupported_launch_rejected_before_tree_or_trust(self):
        for operation in ['admin', 'install-service']:
            with self.subTest(operation=operation), \
                    patch.object(m.os, 'open', side_effect=AssertionError('tree reached')) as opened, \
                    patch.object(m, 'trust', side_effect=AssertionError('trust reached')) as trust, \
                    patch.object(m.os, 'chdir') as chdir, \
                    patch.object(m.os, 'execve') as execute:
                with self.assertRaisesRegex(ValueError, 'unsupported launch operation; supported: prepare\\|owned'):
                    m.launch(None, '/not-read', operation, ['request'], None, None, 'not-a-pin')
                opened.assert_not_called()
                trust.assert_not_called()
                chdir.assert_not_called()
                execute.assert_not_called()


class SignedAncestors(unittest.TestCase):
    # Real launch/extract -> common helper. Archive/trust are never reached
    # on denial; metadata doubles do not simulate rename or kernel behavior.
    def test_unsafe_at_every_depth_denies_before_exec_or_extraction_write(self):
        for operation in ['prepare', 'owned', 'extract']:
            for depth in range(4):  # includes / and final candidate/parent
                for uid, mode in [(2002, 0o755), (0, 0o775), (1001, 0o702), (0, 0o1777)]:
                    metadata = [SimpleNamespace(st_uid=0, st_mode=stat.S_IFDIR | 0o755)
                                for _ in range(4)]
                    metadata[depth] = SimpleNamespace(st_uid=uid, st_mode=stat.S_IFDIR | mode)
                    with self.subTest(operation=operation, depth=depth, uid=uid, mode=mode), \
                            patch.object(m.os, 'getuid', return_value=1001), \
                            patch.object(m.os, 'open', side_effect=[10, 11, 12, 13]) as opened, \
                            patch.object(m.os, 'fstat', side_effect=lambda fd: metadata[fd - 10]), \
                            patch.object(m.os, 'close') as closed, \
                            patch.object(m.runtime, 'read_at') as read, \
                            patch.object(m, 'trust') as trust, \
                            patch.object(m.os, 'mkdir') as mkdir, \
                            patch.object(m.os, 'write') as write, \
                            patch.object(m.os, 'chdir') as chdir, \
                            patch.object(m.os, 'execve') as execute:
                        with self.assertRaisesRegex(ValueError, 'unsafe ancestor'):
                            if operation == 'extract':
                                m.extract(None, '/safe/parent/candidate/new')
                            else:
                                m.launch(None, '/safe/parent/candidate', operation, [], None, None, 'unused')
                        self.assertEqual(opened.call_count, depth + 1)
                        self.assertEqual(closed.call_args_list, [call(fd) for fd in range(10, 11 + depth)])
                        read.assert_not_called()
                        trust.assert_not_called()
                        mkdir.assert_not_called()
                        write.assert_not_called()
                        chdir.assert_not_called()
                        execute.assert_not_called()

    def test_safe_ancestry_does_not_relax_private_final_directory(self):
        for operation in ['prepare', 'owned', 'extract']:
            for uid, mode in [(0, 0o700), (1001, 0o755)]:
                metadata = SimpleNamespace(st_uid=uid, st_mode=stat.S_IFDIR | mode)
                with self.subTest(operation=operation, uid=uid, mode=mode), \
                        patch.object(m.os, 'getuid', return_value=1001), \
                        patch.object(m.os, 'open', side_effect=[10, 11]), \
                        patch.object(m.os, 'fstat', return_value=metadata), \
                        patch.object(m.os, 'close') as closed, \
                        patch.object(m.os, 'mkdir') as mkdir, \
                        patch.object(m.os, 'write') as write, \
                        patch.object(m.os, 'execve') as execute:
                    with self.assertRaisesRegex(ValueError, 'unsafe owner/type/mode/link count'):
                        if operation == 'extract':
                            m.extract(None, '/private/new')
                        else:
                            m.launch(None, '/private', operation, [], None, None, 'unused')
                    self.assertEqual(closed.call_args_list, [call(10), call(11)])
                    mkdir.assert_not_called()
                    write.assert_not_called()
                    execute.assert_not_called()


class SignedBootstrap(unittest.TestCase):
    def setUp(self):
        # Safe-root fixture placement also applies to isolated subprocesses;
        # production ancestry checks are never bypassed to tolerate /tmp.
        parent = str(Path.home())
        os.close(m.runtime.open_directory(parent))
        self.tmp = tempfile.TemporaryDirectory(prefix='g7-signed-bootstrap-', dir=parent)
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.r, self.k = key(), key()
        now = self.now = time.time_ns() // 1000000
        p = {'schemaVersion': 'alica.trust-policy/v1', 'version': 1, 'rootKeyIds': [self.r[1]],
             'publishers': [{'id': 'org.aquiero.alica', 'keyIds': [self.k[1]], 'executionModes': ['ipc']}],
             'issuedAtMs': now - 1000, 'expiresAtMs': now + 600000, 'maxOfflineAgeMs': 600000}
        r = {'schemaVersion': 'alica.revocation/v1', 'version': 1, 'issuedAtMs': now - 1000,
             'expiresAtMs': now + 600000, 'revokedKeyIds': [], 'revokedArtifactDigests': []}
        self.material = {'rootKeyId': self.r[1], 'keys': {self.r[1]: self.r[2], self.k[1]: self.k[2]},
                         'policy': p, 'policySignature': sign(p, 'ALICA-TRUST-POLICY-v1', self.r),
                         'revocation': r, 'revocationSignature': sign(r, 'ALICA-REVOCATION-v1', self.r)}
        self.floor = {'rootKeyId': self.r[1], 'policyVersion': 1, 'revocationVersion': 1, 'lastWallMs': now - 1000}
        self.profile = {'fixture': 'not a real Cell profile'}
        self.files = {'runtime/payload.bin': b'fixture\x00payload',
                      'profile/profile.json': m.canonical(self.profile),
                      'profile/lock.json': m.canonical({'policyDigest': m.digest(m.canonical(p))}),
                      'trust/policy.json': m.canonical(p), 'trust/policy-signature.json': m.canonical(self.material['policySignature']),
                      'trust/revocation.json': m.canonical(r), 'trust/revocation-signature.json': m.canonical(self.material['revocationSignature']),
                      'sbom/sbom.json': b'{"fixture":"not complete SBOM"}', 'provenance/build.json': b'{"fixture":true}'}
        self.archive = self.root / 'candidate.tar'
        self.build()

    def build(self, mutate_bundle=None, sig_domain='ALICA-BUNDLE-v1'):
        self.bundle = {'schemaVersion': 'alica.bundle/v1', 'bundleId': 'disposable-test',
                       'profileDigest': m.digest(m.canonical(self.profile)),
                       'artifacts': [{'path': p, 'bytes': len(b), 'digest': m.digest(b), 'kind': m.kind(p)} for p, b in self.files.items()]}
        if mutate_bundle:
            mutate_bundle(self.bundle)
        self.entries = [('bundle.json', m.canonical(self.bundle)),
                        ('bundle-signature.json', m.canonical(sign(self.bundle, sig_domain, self.k))), *sorted(self.files.items())]
        self.archive.write_bytes(tar(self.entries))

    def inspect(self, root_pin=None):
        a = m.Archive(str(self.archive))
        try:
            return m.inspect(a, self.material, self.floor, root_pin or self.r[1])
        finally:
            a.close()

    def test_real_signature_and_bounded_extraction(self):
        self.assertEqual(self.inspect()['artifacts'], len(self.files))
        a = m.Archive(str(self.archive))
        try:
            m.inspect(a, self.material, self.floor, self.r[1])
            dest = self.root / 'extracted'
            m.extract(a, str(dest))
            for p, b in self.entries:
                self.assertEqual((dest / p).read_bytes(), b)
                self.assertEqual((dest / p).stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                m.extract(a, str(dest))
        finally:
            a.close()

    def test_isolated_independent_tool_delivery(self):
        trusted = self.root / 'trusted'
        trusted.mkdir(mode=0o700)
        for p in ['g7-signed-bootstrap.py', 'g7-runtime-bootstrap.py']:
            shutil.copyfile(REPO / 'tools' / p, trusted / p)
        (trusted / 'schemas').mkdir(mode=0o700)
        for p in ['bundle', 'signature', 'trust-policy', 'revocation']:
            source = REPO / 'specs/schemas' / (p + '.schema.json')
            shutil.copyfile(source, trusted / 'schemas' / source.name)
            self.assertEqual(hashlib.sha256(source.read_bytes()).digest(), hashlib.sha256((trusted / 'schemas' / source.name).read_bytes()).digest())
        for p, v in [('trust.json', self.material), ('floor.json', self.floor)]:
            (self.root / p).write_bytes(m.canonical(v)); (self.root / p).chmod(0o600)
        argv = [sys.executable, '-I', '-B', str(trusted / 'g7-signed-bootstrap.py'), 'extract', str(self.archive),
                self.r[1], str(self.root / 'trust.json'), str(self.root / 'floor.json'), str(self.root / 'cli-extracted')]
        run = subprocess.run(argv, cwd='/', env={'PATH': '/usr/bin:/bin', 'PYTHONPATH': '/not-trusted'}, capture_output=True, timeout=30)
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(json.loads(run.stdout)['bundleDigest'], m.digest(m.canonical(self.bundle)))

    def test_independent_root_substitution(self):
        with self.assertRaisesRegex(ValueError, 'root mismatch'):
            self.inspect(key()[1])

    def test_wrong_signature_domain(self):
        self.build(sig_domain='ALICA-REVOCATION-v1')
        with self.assertRaises(Exception):
            self.inspect()

    def test_unsigned_and_signature_tamper(self):
        for change in [lambda s: s.update(signature='A' * 86 + '=='), lambda s: s.update(keyId=self.r[1])]:
            self.build()
            sig = json.loads(self.entries[1][1]); change(sig)
            self.entries[1] = ('bundle-signature.json', m.canonical(sig))
            self.archive.write_bytes(tar(self.entries))
            with self.subTest(sig=sig), self.assertRaises(Exception):
                self.inspect()

    def test_artifact_tamper(self):
        self.entries[-1] = (self.entries[-1][0], b'changed')
        self.archive.write_bytes(tar(self.entries))
        with self.assertRaisesRegex(ValueError, 'inventory mismatch'):
            self.inspect()

    def test_missing_and_extra(self):
        for entries in [self.entries[:-1], self.entries + [('docs/extra.txt', b'extra')]]:
            self.archive.write_bytes(tar(entries))
            with self.assertRaisesRegex(ValueError, 'inventory count'):
                self.inspect()

    def test_revoked_release_key_and_artifact(self):
        for key_name, value in [('revokedKeyIds', self.k[1]), ('revokedArtifactDigests', m.digest(m.canonical(self.bundle))),
                                ('revokedArtifactDigests', m.digest(self.files['runtime/payload.bin']))]:
            with self.subTest(key=key_name):
                material = copy.deepcopy(self.material)
                self.material['revocation'][key_name].append(value)
                self.material['revocationSignature'] = sign(self.material['revocation'], 'ALICA-REVOCATION-v1', self.r)
                with self.assertRaisesRegex(ValueError, 'revoked'):
                    self.inspect()
                self.material = material

    def test_expired_future_and_stale_trust(self):
        for name, value in [('expiresAtMs', 1), ('issuedAtMs', 9007199254740991), ('maxOfflineAgeMs', 0)]:
            original = copy.deepcopy(self.material)
            self.material['policy'][name] = value
            self.material['policySignature'] = sign(self.material['policy'], 'ALICA-TRUST-POLICY-v1', self.r)
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.inspect()
            self.material = original
        for name, value in [('policyVersion', 2), ('revocationVersion', 2), ('lastWallMs', 9007199254740991)]:
            original = self.floor.copy(); self.floor[name] = value
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.inspect()
            self.floor = original

    def test_strict_trust_shapes_and_authority(self):
        for mutate in [lambda v: v.update(extra=True), lambda v: v['policy'].update(extra=True),
                       lambda v: v['policy'].update(version=True),
                       lambda v: v['policy']['publishers'][0].update(executionModes=['inproc']),
                       lambda v: v['policy']['publishers'].append(copy.deepcopy(v['policy']['publishers'][0]))]:
            original = copy.deepcopy(self.material); mutate(self.material)
            self.material['policySignature'] = sign(self.material['policy'], 'ALICA-TRUST-POLICY-v1', self.r)
            with self.assertRaises(ValueError):
                self.inspect()
            self.material = original

    def test_bundle_closed_schema_and_limits(self):
        for mutate in [lambda v: v.update(extra=True), lambda v: v['artifacts'][0].update(bytes=True),
                       lambda v: v['artifacts'][0].update(bytes=268435457), lambda v: v['artifacts'][0].update(kind='plugin'),
                       lambda v: v['artifacts'].append(v['artifacts'][0].copy())]:
            self.build(mutate)
            with self.assertRaises(ValueError):
                self.inspect()

    def test_paths_and_entry_types(self):
        for p in ['../escape', '/absolute', 'runtime/@scope/x', 'runtime//x', 'runtime/./x', 'x' * 241]:
            with self.subTest(path=p), self.assertRaises(ValueError):
                m.insert(set(), p)
        for p in ['RUNTIME/payload.bin', 'runtime/payload.bin/sub', 'runtime']:
            with self.subTest(path=p), self.assertRaises(ValueError):
                m.insert({'runtime/payload.bin'}, p)
        for kind in [b'1', b'2', b'5', b'x', b'g', b'S', b'3']:
            self.archive.write_bytes(header('x', 0, kind) + b'\0' * 1024)
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                m.Archive(str(self.archive))

    def test_eof_padding_checksum_and_duplicates(self):
        good = tar(self.entries)
        padding_offset = 512 + len(self.entries[0][1])
        bad_padding = bytearray(good); bad_padding[padding_offset] = 1
        bad_checksum = bytearray(good); bad_checksum[0] ^= 1
        for data in [good[:-1], good + b'\0', good + b'\0' * 512, bytes(bad_padding), bytes(bad_checksum), tar(self.entries + [self.entries[-1]])]:
            self.archive.write_bytes(data)
            with self.assertRaises(ValueError):
                m.Archive(str(self.archive))

    def test_metadata_bound_and_large_real_payload(self):
        self.files['runtime/large.bin'] = b'L' * 1048577
        self.build()
        a = m.Archive(str(self.archive))
        try:
            self.assertEqual(m.inspect(a, self.material, self.floor, self.r[1])['artifacts'], len(self.files))
            with self.assertRaisesRegex(ValueError, 'metadata'):
                a.metadata('runtime/large.bin')
            m.extract(a, str(self.root / 'large'))
            self.assertEqual((self.root / 'large/runtime/large.bin').read_bytes(), self.files['runtime/large.bin'])
        finally:
            a.close()

    def test_archive_changed_and_deadline(self):
        a = m.Archive(str(self.archive))
        try:
            a.deadline = 0
            with self.assertRaisesRegex(ValueError, 'deadline'):
                a.read(0, 1)
            self.archive.write_bytes(self.archive.read_bytes() + b'x')
            with self.assertRaisesRegex(ValueError, 'changed'):
                a.unchanged()
        finally:
            a.close()

    def test_disk_short_write_and_symlink_no_publication(self):
        a = m.Archive(str(self.archive))
        try:
            (self.root / 'link').symlink_to(self.root, target_is_directory=True)
            with self.assertRaises(OSError):
                m.extract(a, str(self.root / 'link/out'))
            with patch.object(m.os, 'write', return_value=0), self.assertRaisesRegex(ValueError, 'short write'):
                m.extract(a, str(self.root / 'short'))
            self.assertTrue((self.root / 'short').exists())  # failure residue retained
            with patch.object(m.os, 'fstatvfs') as v:
                v.return_value.f_bavail = 0; v.return_value.f_frsize = 4096
                with self.assertRaisesRegex(ValueError, 'disk reserve'):
                    m.extract(a, str(self.root / 'no-space'))
                self.assertFalse((self.root / 'no-space').exists())
        finally:
            a.close()

    def test_backward_clock_within_one_verification_is_denied(self):
        with patch.object(m.time, 'time_ns', side_effect=[self.now * 1000000, (self.now - 1) * 1000000]):
            with self.assertRaisesRegex(ValueError, 'backward clock'):
                self.inspect()

    def test_launch_contract_mock_only_and_failure_never_executes(self):
        # Contract only: these marker bytes are deliberately NOT a real Node.
        self.files['runtime/bin/node'] = b'non-executable unit marker'
        self.files['runtime/tools/g7-owned-cli.mjs'] = b'unit marker'
        self.files['runtime/tools/g7-cell-cli.mjs'] = b'unit marker'
        self.build()
        a = m.Archive(str(self.archive))
        try:
            m.inspect(a, self.material, self.floor, self.r[1])
            dest = self.root / 'launch'
            m.extract(a, str(dest))
            for operation, script, argument in [('owned', 'g7-owned-cli.mjs', 'cycle'),
                                                 ('prepare', 'g7-cell-cli.mjs', 'status')]:
                with self.subTest(operation=operation), patch.object(m.os, 'execve') as execute, \
                        patch.object(m.os, 'chdir') as chdir, \
                        patch.object(m.sys, 'version_info', (3, 12)), \
                        patch.object(m.sys, 'platform', 'linux'):
                    m.launch(a, str(dest), operation, [argument], self.material, self.floor, self.r[1])
                    node = str(dest / 'runtime/bin/node')
                    execute.assert_called_once_with(node, [node, '--no-global-search-paths', '--experimental-vm-modules',
                                                          str(dest / 'runtime/tools' / script), argument],
                                                    {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'HOME': str(dest)})
                    chdir.assert_called_once_with(str(dest))
            for mutate in ['tamper', 'extra', 'mode', 'missing']:
                payload = dest / 'runtime/payload.bin'
                if mutate == 'tamper':
                    payload.write_bytes(b'X' * len(self.files['runtime/payload.bin']))
                elif mutate == 'extra':
                    (dest / 'extra').mkdir(mode=0o700)
                elif mutate == 'mode':
                    payload.chmod(0o700)
                else:
                    payload.unlink()
                with self.subTest(mutate=mutate), patch.object(m.os, 'execve') as execute:
                    with self.assertRaises((ValueError, OSError)):
                        m.launch(a, str(dest), 'owned', [], self.material, self.floor, self.r[1])
                    execute.assert_not_called()
                if mutate == 'extra':
                    (dest / 'extra').rmdir()
                payload.write_bytes(self.files['runtime/payload.bin']); payload.chmod(0o600)
        finally:
            a.close()

    def test_no_custom_schema_keywords_and_duplicate_json(self):
        with self.assertRaisesRegex(ValueError, 'unsupported trusted schema'):
            m.validate({}, {'type': 'object', 'invented': True})
        for data in [b'{"a":1,"a":2}', b'{"a":NaN}', b'{"a":1.5}', b'[' * 34 + b'0' + b']' * 34]:
            with self.assertRaises(ValueError):
                m.decode(data)


if __name__ == '__main__':
    unittest.main()
