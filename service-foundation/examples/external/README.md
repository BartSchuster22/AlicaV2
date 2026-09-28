# Separately installed native author example — qualified technical release

The author is `provider.mjs`: SDK-only independent echo implementation. It is
packed as @phase50/external-author and installed separately from the operator.
The author installation has no @alica/kernel; the operator installation has the
public Host package. No internal Kernel source/import, repo symlink or registry
publication is needed. Frozen package versions are supplied as local tarballs;
all installs use --offline --ignore-scripts with the pinned cache/toolchain.

`operator.mjs` is the complete readable operator procedure, not a supervisor or
new ServiceManifest runtime API. `host-fixture.mjs` is copied alongside it by the
preparer; it uses the existing public bootstrap/discover/identity/issueGrant API,
fresh ephemeral local signing material and a fresh temporary trust-state path.
Never replace these fixture paths with protected live credentials or ledgers.

Exact attachment order (same for stateless and tiny stateful references):
1. Discover and activate a local signed bootstrap shell declaring the descriptor.
2. Discover a bootstrap consumer, grant existing capability operations, activate.
3. Call the shell via ACAP. Its handlers dispose only the temporary registration
   and reject UNAVAILABLE, never return a false business success. Dispose caller.
4. Assert no registration remains for that provider identity. The frozen Host
   rejects duplicate visible identities, even across root/child scopes.
5. Get the existing public Host context, create its owned child scope, activate
   the native SDK reference there with one explicit operator-owned resource.
6. Discover the real consumer in that scope. Issue root then child grants using
   existing Host identity/generation. Activate the identical consumer module.
7. Observe service-owned health separately from Host state; dispose through Host
   and assert zero registrations/listeners/pendingCalls/effects and clean reports.

The original and independent echo implementations use the exact same consumer.
The stateful reference uses the public additive native-record-resource export,
which is a reference utility, NOT a Kernel filesystem API or authorization broker.
The operator provides its path; manifests neither authorize nor confine access.
No independently signed-native or hostile-code sandbox claim. Only synthetic-test
secret references are available in this demonstrated existing Host binding.

Reproduction from repository root on authorized DEV, pinned Node24.21.0/npm11.19.0:
- After frozen offline dependency install/build, root runs
  `python3 service-foundation/conformance/isolate.py`.
- Launcher invokes preparation as alica-dev with networking disabled: packs public
  packages, creates distinct author/operator installs in a fresh temporary root,
  verifies author cannot resolve Kernel, and hashes unchanged consumer bytes.
- It copies those installs into the allowlisted namespace/chroot, runs as UID1000,
  verifies no container executables/sockets/nonloopback network, then runs tests
  and the external operator. All temporary roots are removed in finally.
- Crash fixture waits for acknowledged completed write, SIGKILLs only its child,
  starts a fresh operator and checks that completed record. This is a bounded test,
  not a restart supervisor or fsync/crash-durability guarantee.

Current status: expanded41-test candidate and this actual installed-author path
PASS on pinned DEV, in native isolation and from fresh anonymous public clone
9b4ec08dac0bf41a3f6dec2e3905e788d86eb426. It consumes the actual separate experimental
Catalog snapshot and validates generated reference manifests before business calls;
normal stop/start, own-child SIGKILL/fresh-restart and cleanup passed. Installed CLI
binary also passed both declaration/config validations. See docs/phase5.0/EVIDENCE.md.
Admission and example generation have already run; public reproduction consumes
committed snapshot/example bytes, not renewed admission. Independent parent technical
review approved scoped publication as phase5.0-service-foundation-v1.0.0. The release
declaration is in docs/phase5.0/PHASE5.0-COMPLETION.md; transport/readback is verified
after push. This is not Owner Acceptance and does not authorize Phase5.1.
