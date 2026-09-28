# M3 Python/ACAP neutral binding ADR — tested bounded path

Acceptance closure: updated neutral suite5/5pass0fail,1652.20829ms via parent-approved execution. Source hashes match local/DEV and log SHA256 verified; see PYTHON-ACAP-SPIKE-EVIDENCE.md. Previous pending-approval/untested paragraphs in development history below are superseded by this closure. No more speculative spike work; product conformance remains separate.

Frozen reference 94570dd322f07e2860016b89c1e81356cc8b65cc. Public contracts inspected: packages/acap-types/src/index.ts (OperationContext, caller principal/instance/scope, deadline, AbortSignal, idempotencyKey); packages/plugin-sdk/src/index.ts (definePlugin, provide, effect, require); service-foundation/conformance/host-fixture.mjs and tests/public-host.test.mjs (existing operator-owned native attachment); reference/services.mjs (public consumer). No direct Python SDK was established in inspected public exports. Private packages/kernel/src/g6/native.ts is not a Python SDK and is rejected as an application integration dependency.

## Candidate minimum language adapter

Public inproc JavaScript provider uses definePlugin/provide; one private, fixed Python child operation receives EOF-framed JSON over anonymous stdin/stdout pipes. No listen port, public transport, generic method router, supervisor or registry. A child is owned by one admitted call, cannot accept another call, and exits after one response; subsequent calls spawn independent children. This is a deliberately narrow neutral spike, not a memory runtime or generic binding. MemoryV4 product changes remain prohibited until M0–M3 PASS.

Public Host test fixture owns synthetic grants and signed fixture packages. Provider author imports SDK/contracts only, never Kernel internals. Existing Foundation public native attachment is reproduced exactly: bootstrap registration retired by ordinary granted call, then child scope provider registered through public context. This is operator-trusted native attachment, not signed Python package execution or hostile-code confinement.

## Trust/authority

Host enforces capability-operation grants before invoking provider. OperationContext.caller is trusted input; request payload cannot choose identity. Operator-owned resolver binds a known instance to a restricted actor/scope/permission set. No resolver entry means PERMISSION_DENIED; mapping is additional narrowing, not grant minting. Python gets only the resolved internal authority, not arbitrary payload authority. Spike fixture permission is neutral.echo, not a MemoryV4 administrative grant. No caller-to-memory scope inference is authorized: memory implementation will require an explicit operator mapping of trusted caller identity to memory authority, checked on every operation. No widening to global/default admin. Caller principal/instance/scope consistency must be covered before M3 is marked PASS.

## Framing/limits/deadlines/cancellation

Single v1 JSON object then stdin EOF; one JSON response then child EOF. 16,384-byte request and response limits, maximum four active children, no queue. Python uses -I -S, explicit fixed source path and sanitized PATH-only environment. Worker validates exact frame/authority keys. No ambient MemoryV4 settings, credentials, database or HTTP imports. Deadline is carried from Host; Python checks before executing; JavaScript deadline and AbortSignal kill child with SIGKILL. Output is accumulated only below limit. Exit/error/malformed frame becomes UNAVAILABLE, oversize becomes RESOURCE_EXHAUSTED. No worker stderr forwarding, stack/secret disclosure or diagnostics containing text. Shutdown owns pending children and waits for actual close. Platform kill/reaping behavior remains to be executed, not assumed.

## Crash/stale/retry

Crash is UNAVAILABLE, never successful empty data. No transparent retry. New calls create fresh children. Provider disposal marks unavailable, kills/reaps active children; Host invalidates handles. Eventual durable-write outcome after crash/deadline may be ambiguous: report failure, preserve original actor/idempotency key and request, allow explicit replay through durable governed domain, never mint a new key or assume rollback. Spike is side-effect-free echo; durable ambiguous-write proof belongs to later MemoryV4 failure matrix, not this neutral test.

## Actual artifact/execution status

Staged and DEV phase51/spike/{neutral.py,provider.mjs,test.mjs} hash-identical. Python syntax lint passed. Updated five node:test cases executed by parent after explicit approval:5/5pass,0fail,1652.20829ms. Principal/received-authority assertions and request-frame/admission bounds passed along with original cases. Saved DEV log hash verified independently. M3 scoped path proof satisfied; installed pre-code gate reconciliation still required before product edits.

Build preparation actually completed on isolated DEV worktree: copied existing dependency tree from Phase5.0, npm run build exit0. Native build initially lacked public Node headers; Phase5.0 header source also absent. Copied existing headers from original AlicaV2/.tools/node/include/node into isolated worktree and rebuilt existing frozen native module successfully. Compiler 0.15.2; bridge SHA256 b22485b4988fec055dc786171712d538cb4d60fd7d0d95e19cd9eb3eea831bab; launcher SHA256 755457be440dd7cfaf69d71cdd9d91b8fb32a34023b467e8e4d01afd52f5bf27. NATIVE-BUILD-ONLY; runtimeQualification=false. No frozen source edits.

## Catalog sequence discovered (not performed)

Existing Catalog prepare.mjs validates draft descriptor, proposal, definition against release:false. Independent parent reviewProposal produces PROPOSED only after review. Existing admit.mjs requires exact reviewed artifacts, actual conformance and implementation hashes, transition(null, experimental entry, evidence), then separate snapshot consumption, trustVerified=false. Admission is not simply marking a draft EXPERIMENTAL, nor owner acceptance. Phase5.1 requires a new finite independent parent packet and scoped minimum real consumer contract; no copied self-review or unearned admission.
