# From an empty directory to a packaged plugin

This tutorial uses only distributed package roots and generated plugin-owned modules. It does not require a monorepo checkout, private path aliases, a Kernel dependency in the author project or a second employee. The math provider is handwritten independently of the Kernel examples.

Prerequisites: the project's pinned Node 24.21.0 / npm toolchain, internet access to fetch ordinary development/transitive dependencies, and the private G5 kit from the maintainer. The kit contains `packages/*.tgz` and `tutorial/`. This is not the offline installer or a public-registry release.

Run commands in a **Linux development terminal**, not a production service directory. Set KIT to the extracted distribution's absolute path.

```sh
export KIT=/absolute/path/to/alica-g5-kit
```

## 1. Start empty; install public SDK artifacts

```sh
mkdir "$HOME/alica-sdk-example"
```

```sh
cd "$HOME/alica-sdk-example"
```

```sh
cp -R "$KIT/tutorial/." .
```

The starter contains source, contract JSON, build/test/verification scripts and package metadata—not compiled private monorepo dependencies. Inspect `package.json`: runtime dependencies are only public ACAP/SDK packages; the Kernel is absent.

```sh
npm install --no-save --ignore-scripts --no-audit --no-fund "$KIT/packages/alica-acap-types-0.0.0.tgz" "$KIT/packages/alica-acap-contracts-0.0.0.tgz" "$KIT/packages/alica-plugin-sdk-0.1.0.tgz" "$KIT/packages/alica-testkit-0.1.0.tgz" "$KIT/packages/alica-alicac-0.0.0.tgz"
```

`--no-save` is important: do not replace portable exact dependency versions with temporary `file:` aliases in the plugin package.

## 2. Define the contract

Initialize a descriptor to see the CLI's closed contract shape:

```sh
./node_modules/.bin/alicac capability init --id org.tutorial.math --out starter.json --json
```

The authored contract is `contracts/math.json`. Instead of the starter's Echo operation, it declares:

- capability `org.tutorial.math`, version `1.0.0`;
- unary `add`, no idempotency guarantee;
- closed input object with required integer `left` and `right`, each between -1000 and 1000;
- integer output between -2000 and 2000.

This explicit contract, not a JavaScript interface or ambient object, is the source of validation and descriptor identity. The starter includes the complete JSON so no hidden authoring tool is needed.

```sh
./node_modules/.bin/alicac capability validate contracts/math.json --json
```

## 3. Generate and build handwritten provider/consumer

`src/provider.ts` imports `definePlugin` from the SDK and generated types/descriptor from its own `generated/provider.mjs`:

```ts
import {definePlugin} from '@alica/plugin-sdk';
import {descriptor} from '../generated/provider.mjs';
import type {handlers as GeneratedHandlers} from '../generated/provider.mjs';
export {descriptor};
export const handlers: typeof GeneratedHandlers = {
  add: async input => input.left + input.right,
};
export const activate = definePlugin({
  activate(ctx) {
    ctx.provide(descriptor, handlers);
    ctx.log({level: 'info', event: 'checkpoint'});
  },
}).activate;
```

Generated scaffold handlers are deliberately not used. `src/consumer.ts` binds its declared requirement during activation, bridges the handle with `clientEndpoint`, and uses generated `createClient`. It exposes `org.tutorial.result` and forwards calls with the inherited deadline and abort signal. Its acquired resource registers cleanup before use.

```sh
npm run build
```

The build uses public G4 generator functions, writes `.mjs` and `.d.mts` outputs, invokes TypeScript, and validates the provider/consumer manifests and descriptor digests. The files are deterministic. A second build must produce the same generated files. The automated qualification also verifies that a wrong generated-client input is a TypeScript error.

## 4. Test and qualify

```sh
npm test
```

The same consumer is exercised against two independently implemented providers. Tests cover denied permissions and use after cleanup; the repository's broader SDK suite additionally covers missing optional capabilities, failures, events, scopes and secrets.

```sh
npm run conformance
```

This emits an actual machine-readable provider contract report. Its checks are contract-level checks, not a package signature or installation certificate.

```sh
npm run run
```

This runs the consumer-to-provider flow through the testkit and prints a result with an explicit **TESTKIT—not production authority** label. See [mock differences](TESTKIT.md).

## 5. Verify contents and package

```sh
npm run verify
```

Verification checks manifest-linked descriptors, runtime/type imports and the npm package file inventory. Only the intended compiled/generated/contract/manifest files are allowed. `src/`, `node_modules/`, key files and private Kernel dependencies are excluded. The automated tutorial puts a synthetic exclusion sentinel in `keys/` and verifies it is absent from the actual archive.

Never put real signing keys into this author project. The verifier is a static content/import check, not proof that arbitrary trusted code cannot conceal a secret or perform unsafe work.

```sh
npm pack --ignore-scripts
```

The resulting `tutorial-plugins-0.1.0.tgz` includes both the provider and consumer, with exact public dependency versions—not absolute paths or workspace aliases.

## 6. Verify and run on a real host, separately

The author project does not install or import the Kernel. For an actual host run, create a separate **operator terminal directory**:

```sh
mkdir "$HOME/alica-sdk-operator"
```

```sh
cd "$HOME/alica-sdk-operator"
```

```sh
npm init -y
```

```sh
npm install --no-save --ignore-scripts --no-audit --no-fund "$KIT/packages/alica-acap-types-0.0.0.tgz" "$KIT/packages/alica-acap-contracts-0.0.0.tgz" "$KIT/packages/alica-plugin-sdk-0.1.0.tgz" "$KIT/packages/alica-kernel-0.0.0.tgz" "$HOME/alica-sdk-example/tutorial-plugins-0.1.0.tgz"
```

```sh
cp "$HOME/alica-sdk-example/operator-run.mjs" .
```

```sh
node --experimental-vm-modules operator-run.mjs
```

The supplied operator script uses only `@alica/kernel`'s public root and public contracts. It creates synthetic trust keys **in memory**, signs complete inventories, lets the host verify the packages before evaluation, and issues explicit grants. The real broker path is:

**operator probe → handwritten consumer → generated client → handwritten provider**.

It checks the result, invalid input and disposed-handle rejection, then prints a `level: PROVIDER`, `transport: inproc` report and a cleanup report. Temporary trust-state files are removed. This synthetic operator ceremony is executable documentation, not a production signing/key-custody or installation/recovery workflow.

## Reproducing qualification

Maintainers run `npm run test:external`. It creates fresh author/operator directories outside the repository; installs only tarballs plus ordinary npm dependencies; builds, tests, checks package contents, invokes the installed CLI, runs conformance and boots the actual host. No private aliases or source imports are available to the author project. `G5_REPORT=/absolute/report.json` records the commands and results; `G5_KIT=/absolute/output-directory` exports the distributable kit.

See [API](API.md), [compatibility policy](COMPATIBILITY.md) and the [G5 gate record](../gates/G5.md).
