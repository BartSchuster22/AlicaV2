// Trusted build-time import of an independently pinned, already verified age subassembly.
import { readFileSync, lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const ensure = (ok, why) => {
  if (!ok) throw new Error(why);
};
export function ageInputs(root, pin) {
  ensure(
    typeof pin === 'string' && /^[0-9a-f]{64}$/.test(pin),
    'independent age inventory pin required',
  );
  const bytes = readFileSync(join(root, 'age-inventory.json'));
  ensure(
    bytes.length <= 1048576 && sha(bytes) === pin,
    'age inventory pin mismatch',
  );
  const data = JSON.parse(bytes);
  ensure(
    data.schemaVersion === 'alica.age-runtime-subassembly/v1' &&
      data.inventory.length <= 4096,
    'age inventory shape',
  );
  const files = new Map();
  for (const e of data.inventory) {
    ensure(
      /^runtime\/(bin\/age|licenses\/age\/[A-Za-z0-9_./-]+|receipts\/age(?:-buildinfo\.txt|\.json))$/.test(
        e.path,
      ) && !e.path.split('/').some((p) => !p || p === '.' || p === '..'),
      'age path',
    );
    ensure(
      !files.has(e.path) &&
        e.bytes <= 268435456 &&
        e.mode === (e.path === 'runtime/bin/age' ? 448 : 384),
      'age entry',
    );
    const s = lstatSync(join(root, e.path));
    ensure(
      s.isFile() &&
        s.nlink === 1 &&
        s.size === e.bytes &&
        (s.mode & 511) === e.mode,
      'age file',
    );
    const b = readFileSync(join(root, e.path));
    ensure(sha(b) === e.sha256, 'age payload mismatch');
    files.set(e.path, b);
  }
  const actual = [];
  function walk(p = '') {
    const s = lstatSync(join(root, p));
    ensure(!s.isSymbolicLink(), 'age link');
    if (s.isDirectory())
      for (const n of readdirSync(join(root, p))) walk(p ? p + '/' + n : n);
    else {
      ensure(s.isFile(), 'age special file');
      actual.push(p);
    }
  }
  walk();
  ensure(
    JSON.stringify(actual.sort()) ===
      JSON.stringify([...files.keys(), 'age-inventory.json'].sort()),
    'age extra/missing files',
  );
  ensure(
    files.has('runtime/bin/age') && data.components.length === 8,
    'age component closure',
  );
  for (const c of data.components) {
    ensure(
      c.linkedInto === 'runtime/bin/age' &&
        c.licenses.length > 0 &&
        c.licenses.every((p) => files.get(p)?.length > 0),
      'age license closure',
    );
  }
  const receipt = JSON.parse(files.get('runtime/receipts/age.json'));
  ensure(
    receipt.binarySha256 === sha(files.get('runtime/bin/age')) &&
      JSON.stringify(receipt.components) === JSON.stringify(data.components),
    'age receipt mismatch',
  );
  files.set('runtime/receipts/age-inventory.json', bytes);
  // Cell durable paths prepend releases/<digest> before the unchanged 16-part,
  // 240-byte validator. Relocate notice bytes, never relax that validator.
  const mappings = [];
  for (const [path, b] of [...files]) {
    if (!path.startsWith('runtime/licenses/age/')) continue;
    const staged = 'releases/' + '0'.repeat(64) + '/' + path;
    if (staged.split('/').length <= 16 && staged.length <= 240) continue;
    const output =
      'runtime/licenses/age/relocated-' + sha(Buffer.from(path)) + '.txt';
    ensure(!files.has(output), 'age notice relocation collision');
    files.delete(path);
    files.set(output, b);
    mappings.push({
      source: path,
      path: output,
      bytes: b.length,
      sha256: sha(b),
    });
  }
  const relocated = new Map(mappings.map((e) => [e.source, e.path]));
  if (mappings.length)
    files.set(
      'runtime/receipts/age-layout.json',
      Buffer.from(
        JSON.stringify(
          {
            boundary:
              'Original pinned age inventory/receipt preserved verbatim; only listed notice paths relocated with identical bytes for Cell-prefixed path bounds.',
            mappings,
          },
          null,
          2,
        ) + '\n',
      ),
    );
  return {
    files,
    components: data.components.map((c) => ({
      ...c,
      licenses: c.licenses.map((p) => relocated.get(p) ?? p),
    })),
    pin,
  };
}
