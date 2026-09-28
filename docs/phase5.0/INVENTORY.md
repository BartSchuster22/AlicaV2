# Initial public primitive inventory (S1)

Inspected at accepted commit 396f4e1f17e0818d0905ddb888170dc784ad85bb.
This is source inventory, not executed Phase5.0 qualification.

Selected exactly one demonstrated binding: public Host inproc plugin binding,
examples/sdk-tutorial/operator-run.mjs. Operator imports bootstrap from public
@alica/kernel; authors use @alica/plugin-sdk definePlugin. No internal imports.
The example discovers signed packages, issues grants, activates plugins, obtains
context.require handles, calls operations, disposes instances and shuts down.

Mapping:
- Observed/discovered means operator host.discover returned an instance identity;
  observer knowledge is not service health or proof of active runtime state.
- Configuration/schema validation is preactivation validation, not a new state.
- Startup/active maps to host.activate and existing plugin activate(context).
- Invocation maps to context.require and handle.call; authority maps to actual
  host.issueGrant and accepted Host scope/grant checks, not service metadata.
- Stop/disposal maps to host.dispose; whole qualification cleanup to host.shutdown.
- Restart must discover/activate another instance, not revive a disposed handle.
- Disposal reports are observed evidence; no independent service lifecycle engine.
- READY/DEGRADED/UNAVAILABLE are service health, not duplicate lifecycle states.

Public contract exports used by accepted examples: canonical/digest/rawDigest,
runConformance from @alica/acap-contracts. Catalog: consumeSnapshot from
@alica/catalog/release; compatibility and governance from @alica/catalog/governance.
Public SDK testkit createTestCell is useful for fixtures but cannot substitute
for actual Host permission/native qualification.

Phase4 services/decision/service/public-host.mjs demonstrates public signed-shell
Host integration, but its attachBackend/pluginBackend event handoff is Decision-
specific. It is not adopted as a generic public service API.

Existing neutral Catalog echo entry:
URI acap://alica.io/example/echo@1, Catalog version 1.0.0;
actual descriptor identity io.alica.example.echo, descriptor version 1.0.0;
digest sha256:76c2818de1cef99248256d1e0ae2561be259d0175ee5b55b7e4dff686e35649d.
Semantics explicitly return supplied text unchanged, without side effects or
persistence guarantees. Thus echo cannot truthfully be relabeled a record store.
A stateful record capability requires a genuinely neutral governed addition,
separate snapshot and real independent parent proposal review, not self-review.

catalog/governance/REVIEW.md requires proposer/reviewer separation, explicit
abstraction/security/scopes/compatibility checks, namespace-authorized transition
and implementation/conformance evidence for promotion. No admission is claimed.

Secret reference mechanism, full Host context exports and native persistence
binding require further source inventory; no invented resolver or filesystem API
is asserted here. Namespace privilege probe succeeded, but container executable,
socket and remote endpoint exclusion is not yet implemented or qualified.

Frozen original Phase1/2/3 tag refs read from origin match the identities in public
Phase4 FINAL-VERIFICATION.json. Phase4 technical/accepted tags and main match the
owner-supplied baseline. Accepted @alica/catalog dependency checker failure stays
inherited FAIL. No live commands, credentials or actual ledgers were accessed.
