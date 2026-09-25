// Unit inputs, NOT age binaries/provenance. Actual-input tests are recorded separately.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { ageInputs } from '../../tools/g7-runtime-inputs.mjs';
const sha = (b) => createHash('sha256').update(b).digest('hex');
function fixture(license = 'runtime/licenses/age/test.txt') {
  const root = mkdtempSync(join(tmpdir(), 'g7-age-input-unit-'));
  const binary = Buffer.from('UNIT FIXTURE NOT AGE');
  const components = Array.from({ length: 8 }, (_, i) => ({
    name: 'fixture-' + i,
    linkedInto: 'runtime/bin/age',
    licenses: [license],
  }));
  const files = new Map([
    ['runtime/bin/age', binary],
    [license, Buffer.from('UNIT LICENSE')],
    [
      'runtime/receipts/age.json',
      Buffer.from(JSON.stringify({ binarySha256: sha(binary), components })),
    ],
  ]);
  const inventory = [];
  for (const [path, b] of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true, mode: 0o700 });
    const mode = path === 'runtime/bin/age' ? 448 : 384;
    writeFileSync(join(root, path), b, { mode });
    inventory.push({ path, bytes: b.length, sha256: sha(b), mode });
  }
  const bytes = Buffer.from(
    JSON.stringify({
      schemaVersion: 'alica.age-runtime-subassembly/v1',
      inventory,
      components,
    }),
  );
  writeFileSync(join(root, 'age-inventory.json'), bytes, { mode: 0o600 });
  return { root, pin: sha(bytes) };
}
for (const license of [
  'runtime/licenses/age/go/src/cmd/compile/internal/ssa/_gen/vendor/golang.org/x/tools/LICENSE',
  'runtime/licenses/age/' + 'a'.repeat(180) + '.txt',
])
  test(
    'notice relocation preserves bytes and original provenance: ' + license,
    () => {
      const { root, pin } = fixture(license);
      try {
        const result = ageInputs(root, pin);
        const mapping = JSON.parse(
          result.files.get('runtime/receipts/age-layout.json'),
        ).mappings;
        assert.equal(mapping.length, 1);
        assert.equal(mapping[0].source, license);
        assert.equal(mapping[0].sha256, sha(Buffer.from('UNIT LICENSE')));
        assert.equal(
          result.files.get(mapping[0].path).toString(),
          'UNIT LICENSE',
        );
        assert(!result.files.has(license));
        assert(
          result.components.every((c) => c.licenses[0] === mapping[0].path),
        );
        assert.equal(
          JSON.parse(result.files.get('runtime/receipts/age.json'))
            .components[0].licenses[0],
          license,
        );
        for (const path of result.files.keys()) {
          const staged = 'releases/' + '0'.repeat(64) + '/' + path;
          assert(staged.length <= 240 && staged.split('/').length <= 16);
        }
        assert.deepEqual(result, ageInputs(root, pin));
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
for (const mode of [
  'valid',
  'wrong-pin',
  'tamper',
  'extra',
  'link',
  'missing-license',
])
  test('pinned age input ' + mode, () => {
    const { root, pin } = fixture();
    try {
      if (mode === 'valid') {
        assert.equal(ageInputs(root, pin).files.size, 4);
        return;
      }
      if (mode === 'wrong-pin') {
        assert.throws(() => ageInputs(root, '0'.repeat(64)), /pin mismatch/);
        return;
      }
      if (mode === 'tamper')
        writeFileSync(join(root, 'runtime/bin/age'), 'tampered');
      if (mode === 'extra') writeFileSync(join(root, 'extra.txt'), 'extra');
      if (mode === 'link') symlinkSync('/etc/passwd', join(root, 'link'));
      if (mode === 'missing-license')
        rmSync(join(root, 'runtime/licenses/age/test.txt'));
      assert.throws(() => ageInputs(root, pin));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
