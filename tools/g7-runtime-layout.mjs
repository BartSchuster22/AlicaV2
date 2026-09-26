// Build-time relocation of a closed set of upstream development-only files.
// Preserve their bytes and provenance; never broaden the frozen bundle grammar.
const auxiliary = new Set([
  'ajv/.runkit_example.js',
  'fast-uri/.gitattributes',
  'fast-uri/.github/dependabot.yml',
  'fast-uri/.github/workflows/ci.yml',
  'fast-uri/.github/workflows/lock-threads.yml',
  'fast-uri/.github/workflows/package-manager-ci.yml',
  'json-schema-traverse/.eslintrc.yml',
  'json-schema-traverse/spec/.eslintrc.yml',
  'json-schema-traverse/.github/FUNDING.yml',
  'json-schema-traverse/.github/workflows/publish.yml',
  'json-schema-traverse/.github/workflows/build.yml',
]);
const safe = (p) =>
  typeof p === 'string' &&
  p.length <= 240 &&
  p.split('/').length <= 16 &&
  /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*(?:\/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)*$/.test(
    p,
  );
export function dependencyLayout(inventory) {
  const seen = new Set();
  const directories = new Set();
  return inventory.map((entry) => {
    const source = entry.path;
    if (
      typeof source !== 'string' ||
      !source.startsWith('runtime/node_modules/')
    )
      throw new Error('unexpected dependency path');
    const relative = source.slice('runtime/node_modules/'.length);
    let path = source;
    if (!safe(source)) {
      if (!auxiliary.has(relative))
        throw new Error('unsupported dependency artifact path: ' + source);
      path =
        'runtime/receipts/dependency-auxiliary/' +
        relative
          .split('/')
          .map((part) => (part.startsWith('.') ? 'dot-' + part.slice(1) : part))
          .join('/');
    }
    const key = path.toLowerCase();
    const parts = key.split('/');
    const parents = parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
    // An output file cannot also be an ancestor directory, in either order.
    if (!safe(path) || seen.has(key) || directories.has(key) ||
        parents.some((parent) => seen.has(parent)))
      throw new Error('invalid or colliding dependency output');
    seen.add(key);
    for (const parent of parents) directories.add(parent);
    return { ...entry, source, path };
  });
}
