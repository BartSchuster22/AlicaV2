// Trusted single-writer build tool; never an untrusted candidate installer.
import { createHash } from 'node:crypto';
import { builtinModules, createRequire } from 'node:module';
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  lstatSync,
  mkdirSync,
  renameSync,
  rmdirSync,
} from 'node:fs';
import { dependencyLayout } from './g7-runtime-layout.mjs';
import { ageInputs } from './g7-runtime-inputs.mjs';
import { resolve, join, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { assembleRuntimeDependencies } from './g7-runtime-dependencies.mjs';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const fail = (v, m) => {
  if (!v) throw new Error(m);
};
const json = (v) => Buffer.from(JSON.stringify(v, null, 2) + '\n');
const runtimePackages = [
  'acap-types',
  'acap-contracts',
  'plugin-sdk',
  'kernel',
];
const tools = [
  'g7-admin.mjs',
  'g7-archive.mjs',
  'g7-cell.mjs',
  'g7-cell-rotation.mjs',
  'g7-owner-ingress.mjs',
  'g7-owner-ingress-config.mjs',
  'g7-backup.mjs',
  'g7-restore.mjs',
  'g7-cell-cli.mjs',
  'g7-cell-owner.mjs',
  'g7-durable.mjs',
  'g7-inspect.mjs',
  'g7-owned-bridge.mjs',
  'g7-owned-cli.mjs',
  'g7-owner-channel.mjs',
  'g7-release.mjs',
  'g7-stopped-verify.mjs',
  'g7-supervisor.py',
  'g7-owned-coordinator.py',
];
// Lexical source selection only. Physical custody/admission is a separate gate.
export function selectNativeInputs(source, locations = undefined) {
  source = resolve(source);
  const roles = ['native/g6/build/bridge.node', 'native/g6/build/launcher',
    'native/g7/build/ownership.node'];
  const paths = Object.fromEntries(roles.map((p) => [p, resolve(source, p)]));
  let receipt = resolve(source, 'native/g7/build/receipt.json');
  let mapped = resolve(source, 'evidence/g7/runtime-assembly/native-attribution-inputs');
  if (locations !== undefined) {
    fail(locations !== null && typeof locations === 'object' &&
      !Array.isArray(locations) &&
      Object.keys(locations).sort().join(',') === 'attributionDirectory,ownershipDirectory',
      'complete native locations required');
    for (const value of Object.values(locations)) {
      fail(typeof value === 'string' && value.startsWith('/') &&
        !value.startsWith('//') && !value.includes('\0') && value !== '/' &&
        posix.normalize(value) === value && !value.endsWith('/') &&
        value !== source && !value.startsWith(source === '/' ? '/' : source + '/'),
        'canonical absolute destination outside original root required');
    }
    paths[roles[2]] = locations.ownershipDirectory + '/ownership.node';
    receipt = locations.ownershipDirectory + '/receipt.json';
    mapped = locations.attributionDirectory;
  }
  return { paths, receipt, mapped };
}

export function assembleRuntime(source, destination, ageRoot, agePin, nativeLocations = undefined) {
  // Reject incomplete/invalid explicit references before age or other payload I/O.
  const selectedNative = selectNativeInputs(source, nativeLocations);
  const age = ageInputs(ageRoot, agePin);
  source = resolve(source);
  destination = resolve(destination);
  const ts = createRequire(join(source, 'package.json'))('typescript');
  const lock = JSON.parse(readFileSync(join(source, 'package-lock.json')));
  fail(
    ts.version === lock.packages['node_modules/typescript'].version,
    'TypeScript mismatch',
  );
  const files = new Map(),
    inputs = new Map(),
    transformations = [];
  const relativeEdges = [];
  const externalNative = new Set(nativeLocations === undefined ? [] : [
    selectedNative.paths['native/g7/build/ownership.node'], selectedNative.receipt,
    ...['binding.json', 'bridge.node.map', 'launcher.map', 'ownership.node.map']
      .map((name) => selectedNative.mapped + '/' + name),
  ]);
  const read = (p) => {
    const physical = externalNative.has(p) ? p : join(source, p);
    const s = lstatSync(physical);
    fail(
      s.isFile() && !s.isSymbolicLink() && s.nlink === 1 && s.size <= 268435456,
      'nonregular input: ' + p,
    );
    const b = readFileSync(physical);
    inputs.set(p, sha(b));
    return b;
  };
  const put = (p, b) => {
    fail(!files.has(p), 'duplicate output');
    files.set(p, Buffer.from(b));
  };
  const copy = (p, out = 'runtime/' + p) => put(out, read(p));
  for (const [p, b] of age.files) put(p, b);
  read('tools/g7-runtime-inputs.mjs');
  const walk = (p) => {
    const s = lstatSync(join(source, p));
    fail(!s.isSymbolicLink(), 'symlink input');
    return s.isDirectory()
      ? readdirSync(join(source, p))
          .sort()
          .flatMap((n) => walk(p + '/' + n))
      : [p];
  };
  const exports = new Map();
  for (const name of runtimePackages) {
    const p = 'packages/' + name + '/package.json',
      m = JSON.parse(read(p));
    for (const [key, value] of Object.entries(m.exports)) {
      const target = typeof value === 'string' ? value : value.import;
      if (
        m.name === '@alica/acap-contracts' &&
        key === './schemas/*' &&
        target === './schemas/*'
      ) {
        for (const p of walk('packages/acap-contracts/schemas')) {
          fail(p.endsWith('.json'), 'unsupported schema export');
          copy(p);
          exports.set(m.name + '/schemas/' + p.split('/').at(-1), p);
        }
        continue;
      }
      fail(
        typeof target === 'string' && target.startsWith('./dist/'),
        'unsupported export',
      );
      exports.set(
        m.name + (key === '.' ? '' : key.slice(1)),
        'packages/' + name + '/' + target.slice(2),
      );
    }
  }
  function transform(p) {
    const b = read(p),
      text = b.toString('utf8'),
      ast = ts.createSourceFile(
        p,
        text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS,
      ),
      edits = [];
    fail(ast.parseDiagnostics.length === 0, 'invalid JS');
    function edge(node) {
      fail(
        ts.isStringLiteral(node),
        'dynamic external dependency unsupported: ' + p,
      );
      const spec = node.text;
      if (spec.startsWith('node:')) {
        fail(
          builtinModules.includes(spec.slice(5)) ||
            builtinModules.includes(spec),
          'unknown builtin',
        );
        return;
      }
      if (spec.startsWith('.')) {
        const target = posix.normalize(posix.join(posix.dirname(p), spec));
        fail(
          !target.startsWith('../') && lstatSync(join(source, target)).isFile(),
          'unresolved relative edge',
        );
        relativeEdges.push({ from: p, target });
        return;
      }
      if (spec.startsWith('ajv/')) {
        fail(
          lstatSync(join(source, 'node_modules', spec)).isFile(),
          'unresolved dependency',
        );
        return;
      }
      const target = exports.get(spec);
      fail(target, 'unresolved external edge: ' + spec + ' in ' + p);
      let output = posix.relative(posix.dirname(p), target);
      if (!output.startsWith('.')) output = './' + output;
      edits.push({
        start: node.getStart(ast),
        end: node.getEnd(),
        value: JSON.stringify(output),
        from: spec,
        to: output,
      });
    }
    function visit(n) {
      if (
        (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
        n.moduleSpecifier
      )
        edge(n.moduleSpecifier);
      if (
        ts.isCallExpression(n) &&
        n.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        fail(n.arguments.length === 1, 'unsupported import');
        edge(n.arguments[0]);
      }
      ts.forEachChild(n, visit);
    }
    visit(ast);
    let output = text;
    for (const e of [...edits].sort((a, b) => b.start - a.start))
      output = output.slice(0, e.start) + e.value + output.slice(e.end);
    put('runtime/' + p, output);
    transformations.push({
      source: p,
      sourceSha256: sha(b),
      output: 'runtime/' + p,
      outputSha256: sha(Buffer.from(output)),
      edges: edits.map(({ from, to }) => ({ from, to })),
    });
    if (p.startsWith('packages/')) {
      const src = p.replace('/dist/', '/src/').replace(/\.js$/, '.ts');
      read(src);
    }
  }
  copy('package.json');
  copy('package-lock.json');
  copy('toolchain.lock.json');
  read('tools/build.mjs');
  read('tools/g7-runtime-assembly.mjs');
  read('tools/g7-runtime-dependencies.mjs');
  read('node_modules/typescript/lib/typescript.js');
  for (const name of runtimePackages) {
    copy('packages/' + name + '/package.json');
    for (const p of walk('packages/' + name + '/dist'))
      if (p.endsWith('.js')) transform(p);
  }
  for (const name of tools)
    name.endsWith('.mjs') ? transform('tools/' + name) : copy('tools/' + name);
  for (const p of [
    'docs/g7/draft/contracts.schema.json',
    'docs/g7/draft/limits.json',
  ])
    copy(p);
  for (const p of walk('specs/schemas'))
    if (p.endsWith('.json')) copy(p, 'schemas/' + p.split('/').at(-1));
  const toolchain = JSON.parse(read('toolchain.lock.json'));
  // Read the authenticated archive rather than trusting a previously extracted binary.
  const nodeArchive = read('.tools/node.tar.xz');
  fail(sha(nodeArchive) === toolchain.node.sha256, 'Node archive mismatch');
  const extract = (name) =>
    execFileSync(
      '/usr/bin/python3',
      [
        '-I',
        '-c',
        'import sys,tarfile; t=tarfile.open(sys.argv[1]); m=t.getmember(sys.argv[2]); assert m.isfile() and m.size<=268435456; sys.stdout.buffer.write(t.extractfile(m).read())',
        join(source, '.tools/node.tar.xz'),
        'node-' + toolchain.node.version + '-linux-x64/' + name,
      ],
      { maxBuffer: 268435456 },
    );
  for (const [name, out] of [
    ['bin/node', 'runtime/bin/node'],
    ['LICENSE', 'runtime/licenses/node-LICENSE'],
  ])
    put(out, extract(name));
  fail(
    sha(read('.tools/node/bin/node')) === sha(files.get('runtime/bin/node')),
    'installed Node is not pinned archive Node',
  );
  const native = [];
  for (const generation of ['g6', 'g7']) {
    const receiptPath = generation === 'g7' && nativeLocations !== undefined
      ? selectedNative.receipt : 'native/' + generation + '/build/receipt.json',
      receiptBytes = read(receiptPath), receipt = JSON.parse(receiptBytes);
    for (const [p, h] of Object.entries(receipt.sources ?? receipt.inputs))
      fail(sha(read(p)) === h, 'stale native source receipt: ' + p);
    fail(
      sha(read('.tools/g6-zig.tar.xz')) === receipt.compilerArchiveSha256,
      'compiler archive changed',
    );
    const compilerLock = JSON.parse(read('native/g6/toolchain.lock.json'));
    fail(
      receipt.compilerArchiveSha256 === compilerLock.sha256,
      'unlocked compiler',
    );
    fail(
      sha(read('.tools/zig-x86_64-linux-' + compilerLock.version + '/zig')) ===
        receipt.compilerExecutableSha256,
      'compiler changed',
    );
    const outputs =
      generation === 'g6'
        ? receipt.artifacts
        : { 'ownership.node': receipt.outputSha256 };
    fail(Object.keys(outputs).sort().join(',') ===
      (generation === 'g6' ? 'bridge.node,launcher' : 'ownership.node'),
      'native output membership');
    for (const [name, h] of Object.entries(outputs)) {
      const p = 'native/' + generation + '/build/' + name;
      const input = generation === 'g7' && nativeLocations !== undefined
        ? selectedNative.paths[p] : p;
      const bytes = read(input);
      fail(sha(bytes) === h, 'stale native output');
      put('runtime/' + p, bytes);
      native.push({ path: 'runtime/' + p, sha256: h });
    }
    put('runtime/receipts/' + generation + '.json', receiptBytes);
  }
  read('tools/g7-runtime-binary-inputs.py');
  read('tools/g7-runtime-node-source.py');
  read('tools/g7-runtime-native-debug.py');
  read('tools/g7-runtime-native-notices.py');
  const mapped = nativeLocations === undefined
    ? 'evidence/g7/runtime-assembly/native-attribution-inputs' : selectedNative.mapped;
  read(mapped + '/binding.json');
  for (const name of ['bridge.node', 'launcher', 'ownership.node'])
    read(
      mapped + '/' + name + '.map',
    );
  const binaryInputs = JSON.parse(
    execFileSync(
      '/usr/bin/python3',
      ['-I', '-B', join(source, 'tools/g7-runtime-binary-inputs.py'), source,
        ...(nativeLocations === undefined ? [] : [JSON.stringify(nativeLocations)])],
      {
        maxBuffer: 16777216,
        env: {
          PATH: '/usr/bin:/bin',
          LANG: 'C.UTF-8',
          ...(process.env.G7_TEST_READELF_DIR === undefined
            ? {}
            : { G7_TEST_READELF_DIR: process.env.G7_TEST_READELF_DIR }),
        },
      },
    ),
  );
  fail(binaryInputs.nativeAttribution.artifacts.length === native.length &&
    new Set(binaryInputs.nativeAttribution.artifacts.map((a) => a.path)).size === native.length,
    'native attribution membership');
  fail(binaryInputs.nativeAttribution.bindingSha256 === inputs.get(mapped + '/binding.json'),
    'native binding observation differs from assembly input');
  for (const artifact of binaryInputs.nativeAttribution.artifacts)
    fail(artifact.mapSha256 === inputs.get(mapped + '/' + posix.basename(artifact.path) + '.map'),
      'native map observation differs from assembly input');
  for (const { path, sha256 } of native) {
    fail(binaryInputs.elf[path]?.sha256 === sha256 &&
      binaryInputs.nativeAttribution.artifacts.some((a) => a.path === path && a.sha256 === sha256),
      'native observation differs from shipped output');
  }
  for (const [p, encoded] of Object.entries(binaryInputs.files))
    put(p, Buffer.from(encoded, 'base64'));
  delete binaryInputs.files;
  put('runtime/receipts/binary-inputs.json', json(binaryInputs));
  const dependencies = assembleRuntimeDependencies(source, destination);
  // The subassembly has exclusive destination creation. Any later failure leaves
  // inspectable partial residue, never a bootable success marker.
  const dependencyMappings = dependencyLayout(dependencies.inventory);
  const inventory = dependencyMappings.map(({ source: original, ...e }) => ({
    ...e,
    mode: 384,
  }));
  for (const { source: original, path: output } of dependencyMappings)
    if (original !== output) {
      mkdirSync(dirname(join(destination, output)), {
        recursive: true,
        mode: 448,
      });
      fail(!files.has(output), 'dependency relocation collision');
      renameSync(join(destination, original), join(destination, output));
      // Only empty directories created by this subassembly, never source/custody roots.
      let parent = dirname(join(destination, original));
      while (
        parent.startsWith(join(destination, 'runtime/node_modules') + '/') &&
        readdirSync(parent).length === 0
      ) {
        rmdirSync(parent);
        parent = dirname(parent);
      }
    }
  const relocated = new Map(dependencyMappings.map((e) => [e.source, e.path]));
  const dependencyComponents = dependencies.components.map((c) => ({
    ...c,
    files: c.files.map((p) => relocated.get(p)),
    licenses: c.licenses.map((p) => relocated.get(p)),
  }));
  put(
    'runtime/receipts/dependency-layout.json',
    json({
      schemaVersion: 'alica.dependency-layout/v1',
      boundary:
        'Closed-set development auxiliary files relocated without byte changes. Runtime module paths unchanged. Original subassembly receipt retains original pre-relocation paths.',
      mappings: dependencyMappings.filter((e) => e.source !== e.path),
    }),
  );
  read('tools/g7-runtime-layout.mjs');
  const dependencyManifest = readFileSync(
    join(destination, 'sbom/dependencies.json'),
  );
  mkdirSync(join(destination, 'runtime/receipts'), {
    recursive: true,
    mode: 448,
  });
  renameSync(
    join(destination, 'sbom/dependencies.json'),
    join(destination, 'runtime/receipts/dependencies.json'),
  );
  inventory.push({
    path: 'runtime/receipts/dependencies.json',
    bytes: dependencyManifest.length,
    sha256: sha(dependencyManifest),
    mode: 384,
  });
  const osBoundary = {
    platform: 'linux-x64',
    python: {
      executable:
        'OS-provisioned: assembly helpers use /usr/bin/python3; owned bridge resolves python3 via PATH',
      minimum: '3.12',
      stdlib:
        'OS-provisioned, not shipped; assembly helpers use -I, but owned bridge does not request -I or -B; no pip runtime dependencies. Runtime interpreter isolation is not asserted.',
    },
    abi: [
      'ELF64 x86-64',
      'glibc and ELF interpreter from prepared OS',
      'libstdc++.so.6',
      'libgcc_s.so.1',
      'libm.so.6',
      'libc.so.6',
      'Linux Landlock/seccomp/pidfd/prctl/flock/AF_UNIX credentials required',
    ],
    qualification:
      'Development host only; two-host compatibility NOT qualified',
    actualElfImports: binaryInputs.elf,
    bootstrapTrustTool:
      'Independently provisioned Python cryptography/Ed25519 plus trusted verifier/schema delivery; never imported from candidate. Cell runtime uses stdlib only.',
  };
  put('runtime/OS-BOUNDARY.json', json(osBoundary));
  put(
    'runtime/licenses/ALICA-NOTICE.txt',
    'ALICA V2 workspace package manifests declare UNLICENSED and private. No public distribution license is granted. Native application code is part of the same private source tree. Third-party notices accompany actual shipped dependencies.\n',
  );
  const sbom = {
    schemaVersion: 'alica.runtime-sbom/v1',
    scope:
      'Standalone current Cell runtime; NOT a production signed release or backup implementation',
    components: [
      {
        name: 'ALICA V2',
        version: '0.0.0',
        license: 'UNLICENSED',
        licenses: ['runtime/licenses/ALICA-NOTICE.txt'],
        packages: runtimePackages,
        native,
      },
      {
        name: 'Node.js',
        version: toolchain.node.version,
        licenses: [
          'runtime/licenses/node-LICENSE',
          ...binaryInputs.node.sourceSupplement.licenses,
        ],
        source: toolchain.node,
        sourceSupplement: binaryInputs.node.sourceSupplement,
        binaryReportedVersions: binaryInputs.node.versions,
        upstreamNoticeSections: binaryInputs.node.noticeSections,
        embeddedComponentLicenseBoundary:
          'Exact source notices, live SQLite identity and defined fdlibm symbols; all deps named notices included conservatively, not an assertion each upstream component is linked or complete source-level copyright closure',
      },
      ...dependencyComponents,
      ...age.components,
      {
        name: 'Native embedded support and compiler-attributed headers',
        licenses: binaryInputs.nativeAttribution.licenses,
        source: binaryInputs.nativeAttribution,
        files: native.map((n) => n.path),
      },
    ],
    buildToolchains: {
      typescript: ts.version,
      nativeCompiler: binaryInputs.nativeSupport.compilerVersion,
      boundary: 'Build tools are not shipped runtime components',
    },
    noticeSupersets: [
      {
        name: 'Native compiler distribution named notices',
        licenses: binaryInputs.nativeSupport.notices.map((n) => n.output),
        source: binaryInputs.nativeSupport,
        boundary:
          'Conservative notice superset only; not evidence these compiler libraries are embedded',
      },
    ],
    osBoundary,
    omissions: [
      'Conservative notice supersets are not complete preprocessor or upstream embedded-component linker closure; LGPL compliance/relinkability and legal approval are not asserted',
    ],
    inventoryBoundary:
      'Every shipped byte is bound by runtime-inventory.json, itself independently pinned for development bootstrap; SBOM/provenance do not self-hash',
    payloadFiles: [
      ...inventory.map(({ mode, ...e }) => e),
      ...[...files].map(([path, b]) => ({
        path,
        bytes: b.length,
        sha256: sha(b),
      })),
    ].sort((a, b) => (a.path < b.path ? -1 : 1)),
    envelopeExclusions: ['sbom/sbom.json', 'provenance/build.json'],
  };
  put('sbom/sbom.json', json(sbom));
  put(
    'provenance/build.json',
    json({
      schemaVersion: 'alica.runtime-build/v1',
      sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: source,
        encoding: 'utf8',
      }).trim(),
      inputs: Object.fromEntries([...inputs].sort()),
      transformations,
      typescript: ts.version,
      ageInventorySha256: age.pin,
      buildCommand:
        'npm run build; npm run build:g6-native; npm run build:g7-native',
      boundary:
        'Input/output receipts, not a claim of independently reproducible compiler output or upstream package tarball reverification',
    }),
  );
  for (const [p, b] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const executable =
      p === 'runtime/bin/node' ||
      p === 'runtime/bin/age' ||
      p === 'runtime/native/g6/build/launcher';
    mkdirSync(dirname(join(destination, p)), { recursive: true, mode: 448 });
    writeFileSync(join(destination, p), b, {
      flag: 'wx',
      mode: executable ? 448 : 384,
    });
    inventory.push({
      path: p,
      bytes: b.length,
      sha256: sha(b),
      mode: executable ? 448 : 384,
    });
  }
  inventory.sort((a, b) => (a.path < b.path ? -1 : 1));
  fail(
    inventory.length <= 4096 &&
      inventory.reduce((n, e) => n + e.bytes, 0) <= 1073741824,
    'assembly limits',
  );
  for (const e of inventory)
    fail(
      /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*(?:\/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)*$/.test(
        e.path,
      ) &&
        e.path.length <= 240 &&
        e.path.split('/').length <= 16,
      'invalid bundle path ' + e.path,
    );
  // Source existence is insufficient: every relative edge must be shipped and pinned.
  const pinnedPaths = new Set(inventory.map(e => e.path));
  for (const { from, target } of relativeEdges)
    fail(pinnedPaths.has('runtime/' + target),
      'unpackaged relative edge: ' + from + ' -> ' + target);
  const result = {
    schemaVersion: 'alica.runtime-inventory/v1',
    qualification: 'DEVELOPMENT_RUNTIME_NOT_PRODUCTION_SIGNED',
    inventory,
  };
  writeFileSync(join(destination, 'runtime-inventory.json'), json(result), {
    flag: 'wx',
    mode: 384,
  });
  return result;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  fail(
    process.argv.length === 6 || process.argv.length === 7,
    'usage: g7-runtime-assembly.mjs SOURCE NEW_DESTINATION VERIFIED_AGE_ROOT INDEPENDENT_AGE_INVENTORY_SHA256 [NATIVE_LOCATIONS_JSON]',
  );
  console.log(
    JSON.stringify({
      files: assembleRuntime(...process.argv.slice(2, 6),
        ...(process.argv.length === 7 ? [JSON.parse(process.argv[6])] : [])).inventory.length,
    }),
  );
}
