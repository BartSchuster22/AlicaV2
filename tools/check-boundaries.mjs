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
    const relFile = path.relative(root, file);
    const normalizedFile = relFile.replaceAll('\\', '/');
    const packageSource = relFile.startsWith('packages' + path.sep);
    const kernel = relFile.startsWith(
      'packages' + path.sep + 'kernel' + path.sep,
    );
    const contract = relFile.startsWith(
      'packages' + path.sep + 'acap-contracts' + path.sep,
    );
    const cli = relFile.startsWith('packages' + path.sep + 'alicac' + path.sep);
    // Exact importer -> exact target allowlist; never expose kernel internals
    // to package code or to arbitrary tests under the same directory.
    const privateG6Targets = {
      'tests/ipc/wire.test.mjs': [
        'packages/kernel/dist/g6/schema.js',
        'packages/kernel/dist/g6/wire-schema.js',
        'packages/kernel/dist/g6/wire.js',
      ],
      'tests/ipc/scheduler.test.mjs': [
        'packages/kernel/dist/g6/scheduler.js',
        'packages/kernel/dist/g6/wire.js',
      ],
      'tests/ipc/sdk-bookkeeping.test.mjs': [
        'packages/kernel/dist/g6/sdk-effects.js',
        'packages/kernel/dist/g6/sdk-rpc.js',
        'packages/kernel/dist/g6/broker-effects.js',
      ],
      'tests/ipc/reap.test.mjs': ['packages/kernel/src/g6/reap.ts'],
      'tests/ipc/scope-correction.test.mjs': [
        'packages/kernel/dist/g6/host-adapter.js',
        'packages/kernel/dist/g6/native.js',
      ],
      'tests/ipc/session-qualification.test.mjs': [
        'packages/kernel/dist/execution-context.js',
        'packages/kernel/dist/g6/host-adapter.js',
        'packages/kernel/dist/g6/session.js',
        'packages/kernel/dist/g6/native.js',
      ],
      'tests/ipc/qualification-worker.mjs': [
        'packages/kernel/dist/g6/worker-transport.js',
        'packages/kernel/dist/g6/native.js',
      ],
      'tests/ipc/isolation.test.mjs': [
        'packages/kernel/dist/g6/host-adapter.js',
        'packages/kernel/dist/g6/session.js',
        'packages/kernel/dist/g6/sdk-rpc.js',
      ],
      'tests/ipc/isolation-worker.mjs': [
        'packages/kernel/dist/g6/worker-transport.js',
        'packages/kernel/dist/g6/worker-sdk-channel.js',
        'packages/kernel/dist/g6/native.js',
      ],
      'tests/ipc/scope-wire.test.mjs': ['packages/kernel/dist/g6/wire.js'],
    };
    const privateG6ComponentTest = normalizedFile === 'tests/ipc/wire.test.mjs';
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
      const normalizedTarget = rel.replaceAll('\\', '/');
      if (rel.startsWith('..') || path.isAbsolute(rel))
        errors.push('outside repository');
      const allowedPrivateG6Target =
        privateG6Targets[normalizedFile]?.includes(normalizedTarget) ?? false;
      const targetPackage = rel.match(/^packages[/\\]([^/\\]+)/)?.[1];
      const owner = path
        .relative(root, file)
        .match(/^packages[/\\]([^/\\]+)/)?.[1];
      if (
        owner &&
        !target.startsWith(path.join(root, 'packages', owner) + path.sep)
      )
        errors.push('package path escapes its own package');
      if (targetPackage && targetPackage !== owner && !allowedPrivateG6Target)
        errors.push('cross-package path import');
      if (path.isAbsolute(name)) errors.push('absolute import');
    } else if (
      !name.startsWith('node:') &&
      name !== 'typescript' &&
      !(contract && ['ajv', 'ajv/dist/2020.js'].includes(name)) &&
      !(privateG6ComponentTest && name === 'ajv/dist/2020.js')
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
