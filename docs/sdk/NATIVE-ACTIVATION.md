# Trusted native activation — Phase 5.A candidate

This is a new, operator-only Kernel/Service Foundation API candidate. It does not modify the frozen Phase 5.I release, SDK plugin context, ACAP Memory descriptor or ordinary signed-package linker. It is not a production installation or sandbox claim.

## Public surface

The Kernel root now exports TypeScript `NativeAdmission` and `NativeImplementation`. `BootstrapOptions.nativeImplementations` optionally supplies a bounded, copied operator registry. A plugin cannot obtain this registry from its context.

```ts
interface NativeAdmission {
  schemaVersion: 'alica.native-admission/v1';
  implementationId: string;
  packageDigest: string;
  configurationDigest: string;
  artifacts: {path: string; digest: string}[];
  issuedAtMs: number;
  expiresAtMs: number;
}
interface NativeImplementation {
  admission: NativeAdmission;
  configuration: Value;
  activate(context: KernelContext, configuration: Value): void | Promise<void>;
}
```

`host.activateNative(instanceId, implementationId)` requires the exact verified signed package digest, `inproc` execution, a currently valid local operator admission, a matching configuration digest and approved canonical file bytes. It invokes the registered trusted callback **inside ordinary Host activation**, not after publication. Signed descriptor validation, staged registration completeness, grants, scope and cleanup remain authoritative. Ordinary `host.activate()` does not automatically select a native replacement. Native activation is not supported for IPC packages by this candidate.

`host.revokeNative(implementationId)` marks the admission revoked immediately and awaits existing disposal for attached instances. Native expiry schedules proactive disposal even while idle; use-time freshness checks remain. Admission data is detached/frozen, and the callback reference is captured at bootstrap. Inspection exposes the admission digest, implementation ID, expiry and revoked state without configuration contents. Audit includes digest-bound admission/expiry/revocation events.

No existing closed manifest/config schema is extended. The new admission document has its own `alica.native-admission/v1` identity and strict runtime shape checks. Local operator admission is privileged administrative configuration, **not an independently signed authorization document**. The selected package must still pass the existing signature/inventory/trust checks. No public plugin import or context API can mint these admissions.

## Trust model and deployment requirements

- The operator process, callback wiring, Host/SDK bootstrap and OS platform are trusted. The Host does not prove arbitrary callback semantics by hashing a function string.
- Approve a reviewed implementation/configuration and dependency inventory; do not mistake hashes generated from arbitrary current files for independent approval.
- Runtime code and application dependencies must be immutable to the runtime identity. Qualification uses read-only bind mounts for the candidate tree and Python venv in a private mount namespace, plus non-root UID and no-new-privileges. This avoids mutable-deployment races between inventory checking and native import/use.
- The Memory inventory includes adapter/composition source, provider, Python bridge and application tree, existing Python caches, the venv/interpreter identity and site-packages, relevant Node package metadata, SDK/contracts outputs/schemas and their Node dependency trees. Traversal has cycle/entry/byte limits. Linux, Node builtins, Python standard library and system shared libraries are the explicitly trusted platform, not claimed to be a hermetically sealed closure.
- Native code has ordinary operator process privileges. Host grants regulate broker-mediated calls, not arbitrary native filesystem/process actions. This is **not** a hostile-code sandbox.
- Native module evaluation must be side-effect-free; external acquisitions register cleanup before use. Promise deadlines cannot preempt arbitrary synchronous JavaScript or cancel every imported module's work. Timeout reports retain `restartRequired`/unsettled-work information rather than pretending a stuck promise was forcibly stopped.
- Inventory generation/verification is synchronous and bounded by file/byte limits, but not preemptively time-limited. Prepare the inventory in a controlled deployment; this candidate is not an untrusted filesystem scanner.
- No automatic native restart or renewal. Reconstruct a new composition and explicitly grant new caller authority. Old handles and old sessions must not be migrated implicitly.

## Memory composition

`service-foundation/tooling/native-memory.mjs` exports:

- `memoryNativeArtifacts(python)`: inventory for this installed source layout and explicit venv interpreter.
- `memoryNativeImplementation({admission, configuration, descriptor, resolveAuthority})`: validates the complete expected Memory inventory and explicit `{python, databasePath}` configuration, then returns the lazy native implementation and active-child observer.

`service-foundation/tooling/native-memory-composition.mjs` exports:

```js
await startMemoryReadComposition({
  configText,
  bootstrapOptions,       // existing trust material/state configuration
  signedProviderPackage, // complete existing signed package inventory
  admission,             // package/configuration/artifact-bound operator approval
  configuration,         // absolute python and databasePath
  descriptor,            // unchanged signed Memory descriptor
  resolveAuthority,      // trusted server-owned mapping, never caller payload
});
```

The returned `{host, providerId, active, close}` is an **operator** object, not a browser/plugin API. Failed composition shuts down the partially constructed Host before rethrowing. The provider's module is lazily imported only after native admission, and its real `plugin.activate(ctx)` participates in the standard lifecycle. There is no placeholder registration, unregister/re-register probe, private Host method or global injection.

Consumer packages are separately signed/discovered, receive explicit `get/search` grants, activate normally and obtain public SDK handles. The unchanged HTTPS read binding takes those handles and server-owned subject policies. It cannot issue grants or read the SQLite store directly. Memory's `create` operation remains in its descriptor but is not granted/routed for this application.

## Qualification and limits

The accompanying designated-DEV qualification retains the earlier 19 HTTPS/session/scope/grant checks, adds real reconstruction/old-handle/old-session/native-revocation checks, and separately exercises native admission, partial acquisition failure, timeout, idle expiry and integrity controls. Test signing keys and bearer sessions are ephemeral and local; they are not production key custody or browser login.

The native-control inventory cache case uses an isolated synthetic tree solely to verify that cache bytes and directory cycles are handled; no synthetic Memory response is used. The read suite operates the real Memory provider against a private copy of designated reference data. Native retrieval-event telemetry is permitted only in that copy; record content/create audit/idempotency must remain unchanged.

Technical candidate qualification is not publication, Owner Acceptance, production rollout, browser SSO or permission to start broader application work.
