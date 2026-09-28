# Phase3 security and authority model

Trusted operator and trusted pinned Python integration, not a hostile-code sandbox.
Kernel/ACAP/SDK and frozen Phase2 contracts remain unchanged. No gateway, memory
service, community-plugin import or JEV integration is included.

## Enforcement

- Public capability grants precede consumer activation. Signed package/event
  declarations and explicit provider event grants do not give arbitrary other
  instances bridge authority. Source identity/scope/generation/principal and
  correlation checks constrain accepted messages.
- Fresh empty request home/workspace is created before Hermes imports. Environment
  is cleared, project plugins disabled, safe mode enabled, config supplied by the
  adapter. No existing profile, context files, identity, persistent memory, session
  DB, credential pool, background review or fallback model is used.
- Only the immutable native fixture tool is enabled. Entire tool batches are
  validated before inline or registry dispatch; mixed allowed/denied batches are
  rejected without executing the allowed prefix. Arbitrary file/shell/network,
  memory, todo and delegation tools are not consumer authority.
- Python audit restrictions deny subprocess/exec and ambient network activity and
  credential/dotenv reads. Offline traffic uses MockTransport. The live transport
  permits only its fixed POST responses endpoint, with no redirects/proxies/retries.
  This is trusted Python control, not resistance to malicious Python mutation,
  native extensions, escaped process sessions or arbitrary owner tampering.
- Fixed model gpt-5.6-sol/context272000; no supported provider generation/token/
  billing ceiling. SDK retries0, native retries constrained, no refresh/pool
  recovery or fallback. Reservation occurs before each physical send, including
  tool followups. Failed/incomplete streams poison continuation.

## Consumed original authority — historical evidence only

Original grant identity `phase3-owner-codex-gpt-5.6-sol-3-total`: actual original
H12 consumed2of3, auth absence and BOTH attempt records independently verified.
Remaining1 is NOT authority. No rerun, reprovisioning, reset, renewal or deletion
of durable ledger/attempts/reports is authorized. Reproduction MUST be MOCK only.
Tests of authority helpers inject disposable state, not the original directory.

Temporary minimal live auth was consumed/unlinked before importing Hermes; the
surviving operator/outer supervisor checked cleanup. Credentials may remain in
SDK memory until exit: no secure zeroization claim. Python/JS finally blocks are
not guaranteed after SIGKILL or cleanup-owner death. Observed successful cleanup
is not universal crash safety, and local reservations are not provider billing.

## Review and test scope

Retained distinct-agent source review examined native route, durable reservations,
endpoint restrictions, cleanup and unchanged consumer. Its finite B1 outer-workflow
allocation/validation cleanup blocker was corrected and independently retested on
exact workflow hashes. The review was not a human audit, runtime attestation or
approval of all H0–H20. The retained original H12 subsequently passed; no new live
run is needed or permitted to reproduce that historical fact.

Lifecycle tests cover denied/foreign authority, cancellation, output bounds,
controlled crashes and cleanup; native MOCK tests cover fixture execution and
policy denials. Do not describe tests of disabled discovery as qualification of
the whole Hermes plugin ecosystem. Wrong pinned checkout, missing runtime,
absent/disabled native tool, invalid/missing config/secret, actual native tool
failure and selected Catalog/version negatives now have executed bounded tests;
see the per-row acceptance matrix. Native child logging is disabled before imports
and restored on exit. This deliberately relies on a trusted isolated child, not
malicious code that re-enables logging or writes directly. Raw exception output
is never the public diagnostic contract.
