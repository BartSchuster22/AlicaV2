#!/usr/bin/python3
"""Disposable-key tests for the operator ceremony; never accesses actual custody."""
import base64
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('bootstrap', ROOT / 'tools/g7-bootstrap-trust.py')
assert spec is not None and spec.loader is not None
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)


class BootstrapTests(unittest.TestCase):
    def setUp(self):
        self.root = Ed25519PrivateKey.generate()
        self.release = b.public(Ed25519PrivateKey.generate())
        self.material = b.build_material(self.root, self.release, 1000)

    def test_canonical_golden_vectors(self):
        vectors = json.loads((ROOT / 'specs/vectors/canonical.json').read_text())['vectors']
        for vector in vectors:
            with self.subTest(vector=vector['id']):
                result = b.canonical(vector['value'])
                self.assertEqual(result.hex(), vector['canonicalHex'])
                self.assertEqual(b.digest(result), vector['digest'])

    def test_invalid_json_values(self):
        for value in [1.0, float('nan'), 9007199254740992, {'é': 1}, '\ud800', {1: 'x'}]:
            with self.subTest(value=repr(value)), self.assertRaises((ValueError, UnicodeError)):
                b.canonical(value)

    def test_duplicate_keys_and_oversize(self):
        for data in [b'{"a":1,"a":2}', b'{"x":NaN}', b'{"x":1.5}', b' ' * (b.MAX_INPUT + 1)]:
            with self.assertRaises(ValueError):
                b.parse(data)

    def test_depth(self):
        value = None
        for _ in range(34):
            value = [value]
        with self.assertRaises(ValueError):
            b.canonical(value)

    def test_distinct_keys_and_clock(self):
        for now in [-1, True, 1.2, 9007199254740991]:
            with self.assertRaises(ValueError):
                b.build_material(self.root, self.release, now)
        with self.assertRaises(ValueError):
            b.build_material(self.root, b.public(self.root), 1)
        with self.assertRaises(ValueError):
            b.build_material(X25519PrivateKey.generate(), self.release, 1)

    def test_pinned_record(self):
        record = {'role': 'root', 'algorithm': 'ed25519', 'testOnly': False, 'keyId': b.digest(b.public(self.root))[7:], 'publicKeyBase64': base64.b64encode(b.public(self.root)).decode()}
        expected = b.digest(b.public(self.root))
        self.assertEqual(b.decode_public(record, 'root', expected), b.public(self.root))
        for field, value in [('testOnly', True), ('algorithm', 'x25519'), ('role', 'release'), ('keyId', '0' * 64), ('publicKeyBase64', record['publicKeyBase64'] + '\n')]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                b.decode_public({**record, field: value}, 'root', expected)
        with self.assertRaises(ValueError):
            b.decode_public(record, 'root', b.digest(self.release))

    def test_file_checks(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory) / 'record'; p.write_bytes(b'{}'); p.chmod(0o600)
            self.assertEqual(b.read_owned(p, os.getuid()), b'{}')
            with self.assertRaises(ValueError):
                b.read_owned(p, os.getuid() + 1)
            p.chmod(0o644)
            with self.assertRaises(ValueError):
                b.read_owned(p, os.getuid())
            p.chmod(0o600)
            link = Path(directory) / 'link'; link.symlink_to(p)
            with self.assertRaises(OSError):
                b.read_owned(link, os.getuid())
            with self.assertRaises(ValueError):
                b.read_owned(Path(directory), os.getuid())

    def test_initial_publication_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            target = b.publish(base, self.material)
            before = (target / 'material.json').read_bytes()
            self.assertEqual(b.parse(before), self.material)
            for p in target.iterdir():
                self.assertEqual(p.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(ValueError):
                b.publish(base, self.material)
            self.assertEqual(before, (target / 'material.json').read_bytes())

    def test_existing_symlink_target_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            (base / 'trust-bootstrap').symlink_to(base / 'missing')
            with self.assertRaises(ValueError):
                b.publish(base, self.material)

    def test_crash_before_publish_preserves_staging_without_accepted_target(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            with patch.object(b.os, 'fsync', side_effect=OSError('simulated IO failure')):
                with self.assertRaises(OSError):
                    b.publish(base, self.material)
            self.assertFalse((base / 'trust-bootstrap').exists())
            self.assertTrue(list(base.glob('.trust-bootstrap-*')))

    def test_separate_signature_domains(self):
        from cryptography.exceptions import InvalidSignature
        sig = base64.b64decode(self.material['policySignature']['signature'])
        self.root.public_key().verify(sig, b'ALICA-TRUST-POLICY-v1\n' + b.canonical(self.material['policy']))
        with self.assertRaises(InvalidSignature):
            self.root.public_key().verify(sig, b'ALICA-BUNDLE-v1\n' + b.canonical(self.material['policy']))


if __name__ == '__main__':
    unittest.main(verbosity=2)
