import ts from 'typescript';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
export function violations(file, source, root) {
  const errors = [];
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  function check(spec) {
    // Only the operator-selected, trusted provider loader may use a computed import.
    if (
      path.relative(root, file).replaceAll('\\', '/') ===
        'packages/alicac/src/provider-loader.ts' &&
      spec?.getText(sf) === 'pathToFileURL(realpathSync(providerPath)).href'
    )
      return;
    if (!spec || !ts.isStringLiteralLike(spec)) {
      errors.push('computed import');
      return;
    }
    const name = spec.text;
    const packageSource = path
      .relative(root, file)
      .startsWith('packages' + path.sep);
    const kernel = path
      .relative(root, file)
      .startsWith('packages' + path.sep + 'kernel' + path.sep);
    const contract = path
      .relative(root, file)
      .startsWith('packages' + path.sep + 'acap-contracts' + path.sep);
    const cli = path
      .relative(root, file)
      .startsWith('packages' + path.sep + 'alicac' + path.sep);
    if (
      packageSource &&
      ((!kernel && !contract && !cli && name.startsWith('node:')) ||
        name === 'typescript')
    )
      errors.push(
        'foundation packages cannot depend on host or developer tooling',
      );
    if (name.startsWith('@alica/')) {
      const allowed = packageSource
        ? ['@alica/acap-types', '@alica/acap-contracts', '@alica/plugin-sdk']
        : [
            '@alica/acap-types',
            '@alica/acap-contracts',
            '@alica/plugin-sdk',
            '@alica/testkit',
            '@alica/kernel',
          ];
      if (!allowed.includes(name))
        errors.push('non-public or undeclared package import');
    } else if (name.startsWith('.') || path.isAbsolute(name)) {
      const target = path.resolve(path.dirname(file), name);
      const rel = path.relative(root, target);
      if (rel.startsWith('..') || path.isAbsolute(rel))
        errors.push('outside repository');
      const targetPackage = rel.match(/^packages[/\\]([^/\\]+)/)?.[1];
      const owner = path
        .relative(root, file)
        .match(/^packages[/\\]([^/\\]+)/)?.[1];
      if (
        owner &&
        !target.startsWith(path.join(root, 'packages', owner) + path.sep)
      )
        errors.push('package path escapes its own package');
      if (targetPackage && targetPackage !== owner)
        errors.push('cross-package path import');
      if (path.isAbsolute(name)) errors.push('absolute import');
    } else if (
      !name.startsWith('node:') &&
      name !== 'typescript' &&
      !(contract && ['ajv', 'ajv/dist/2020.js'].includes(name))
    )
      errors.push('undeclared external import');
  }
  function visit(n) {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) {
      if (n.moduleSpecifier) check(n.moduleSpecifier);
    }
    if (ts.isImportTypeNode(n)) check(n.argument.literal);
    if (
      ts.isCallExpression(n) &&
      (n.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(n.expression) && n.expression.text === 'require'))
    )
      check(n.arguments[0]);
    ts.forEachChild(n, visit);
  }
  visit(sf);
  return errors;
}
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory()
      ? ['dist', 'node_modules'].includes(e.name)
        ? []
        : walk(p)
      : /\.(?:ts|mjs)$/.test(e.name)
        ? [p]
        : [];
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const root = path.resolve(process.argv[2] || '.');
  let failed = false;
  for (const folder of ['packages', 'tests', 'tools'])
    for (const file of walk(path.join(root, folder))) {
      for (const error of violations(file, readFileSync(file, 'utf8'), root)) {
        console.error(path.relative(root, file) + ': ' + error);
        failed = true;
      }
    }
  if (failed) process.exitCode = 1;
  else console.log('Public import boundaries passed');
}
