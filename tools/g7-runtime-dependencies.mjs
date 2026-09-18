// Build-time dependency subassembly only. No candidate package code is executed.
// This does not assemble the Cell, Python/Node/native runtime, or grant release approval.
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (condition, message) => {
  if (!condition) throw new Error(message);
};
function regular(path) {
  const s = lstatSync(path);
  fail(
    s.isFile() && !s.isSymbolicLink() && s.nlink === 1,
    'nonregular input: ' + path,
  );
  fail(s.size <= 256 * 1024 * 1024, 'oversize input');
  return readFileSync(path);
}
function directory(path) {
  fail(
    lstatSync(path).isDirectory() && !lstatSync(path).isSymbolicLink(),
    'non-directory input',
  );
}
function safe(path) {
  fail(
    /^[A-Za-z0-9._/-]+$/.test(path) &&
      path.length <= 240 &&
      path.split('/').length <= 16 &&
      path.split('/').every((p) => p && p !== '.' && p !== '..'),
    'unsupported artifact path: ' + path,
  );
}
export function assembleRuntimeDependencies(source, destination) {
  source = resolve(source);
  destination = resolve(destination);
  directory(source);
  directory(join(source, 'node_modules'));
  const lockBytes = regular(join(source, 'package-lock.json'));
  const lock = JSON.parse(lockBytes);
  fail(lock.lockfileVersion === 3, 'unsupported lock');
  const pending = ['ajv'],
    seen = new Set(),
    components = [],
    files = new Map();
  let total = 0;
  while (pending.length) {
    const name = pending.shift();
    if (seen.has(name)) continue;
    fail(/^[a-z0-9][a-z0-9-]*$/.test(name), 'unsupported dependency name');
    seen.add(name);
    const key = 'node_modules/' + name,
      record = lock.packages[key];
    fail(
      record &&
        !record.link &&
        typeof record.integrity === 'string' &&
        typeof record.resolved === 'string',
      'missing locked dependency: ' + name,
    );
    const path = join(source, key);
    directory(path);
    const manifest = JSON.parse(regular(join(path, 'package.json')));
    fail(
      manifest.name === name && manifest.version === record.version,
      'installed version differs from lock',
    );
    const dependencies = Object.keys(manifest.dependencies ?? {}).sort();
    fail(
      JSON.stringify(Object.entries(manifest.dependencies ?? {}).sort()) ===
        JSON.stringify(Object.entries(record.dependencies ?? {}).sort()),
      'dependency edges differ from lock',
    );
    fail(
      !Object.keys(manifest.optionalDependencies ?? {}).length &&
        !Object.keys(manifest.peerDependencies ?? {}).length &&
        !manifest.bundleDependencies &&
        !manifest.bundledDependencies,
      'unsupported dependency category',
    );
    const paths = [],
      licenses = [];
    function walk(dir, prefix = '') {
      directory(dir);
      for (const n of readdirSync(dir).sort()) {
        fail(n !== 'node_modules', 'nested dependency resolution unsupported');
        const relative = prefix + n,
          p = join(dir, n),
          s = lstatSync(p);
        safe(relative);
        if (s.isDirectory() && !s.isSymbolicLink()) walk(p, relative + '/');
        else {
          const bytes = regular(p),
            output = 'runtime/' + key + '/' + relative;
          safe(output);
          total += bytes.length;
          fail(
            files.size < 4090 && total <= 1024 * 1024 * 1024,
            'subassembly limits exceeded',
          );
          files.set(output, bytes);
          paths.push(output);
          if (
            /^(license|copying|copyright)(\.[A-Za-z0-9_-]+)?$/i.test(relative)
          )
            licenses.push(output);
        }
      }
    }
    walk(path);
    fail(
      licenses.length > 0 &&
        typeof manifest.license === 'string' &&
        manifest.license === record.license,
      'license evidence absent or inconsistent',
    );
    components.push({
      name,
      version: manifest.version,
      license: manifest.license,
      lockIntegrity: record.integrity,
      resolved: record.resolved,
      dependencies,
      licenses,
      files: paths,
    });
    pending.push(...dependencies);
  }
  components.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const inventory = [...files]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([path, bytes]) => ({
      path,
      bytes: bytes.length,
      sha256: hash(bytes),
    }));
  const bom = {
    schemaVersion: 'alica.runtime-dependency-subassembly/v1',
    qualification: 'DEPENDENCY_SUBASSEMBLY_ONLY_NOT_RELEASE_SBOM',
    roots: ['ajv'],
    packageLockSha256: hash(lockBytes),
    components,
    inventory,
    omitted: [
      'application modules and AST import transformation',
      'Node and embedded dependencies',
      'Python interpreter/stdlib and OS ABI boundary',
      'native artifacts',
      'age and bootstrap',
      'complete release licensing/provenance and two-host qualification',
    ],
    integrityBoundary:
      'Raw staged bytes are hashed; npm tarball integrity is provenance from the lock, not reverified tarball evidence.',
  };
  // Exclusive destination: preserve partial residue on any IO failure, never overwrite.
  mkdirSync(destination, { mode: 0o700 });
  for (const [p, bytes] of files) {
    mkdirSync(dirname(join(destination, p)), { recursive: true, mode: 0o700 });
    writeFileSync(join(destination, p), bytes, { mode: 0o600, flag: 'wx' });
  }
  mkdirSync(join(destination, 'sbom'), { mode: 0o700 });
  writeFileSync(
    join(destination, 'sbom/dependencies.json'),
    JSON.stringify(bom, null, 2) + '\n',
    { mode: 0o600, flag: 'wx' },
  );
  return bom;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length !== 4)
    throw new Error(
      'usage: g7-runtime-dependencies.mjs SOURCE NEW_DESTINATION',
    );
  const result = assembleRuntimeDependencies(process.argv[2], process.argv[3]);
  console.log(
    JSON.stringify({
      qualification: result.qualification,
      packages: result.components.length,
      files: result.inventory.length,
      packageLockSha256: result.packageLockSha256,
    }),
  );
}
