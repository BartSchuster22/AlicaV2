# G6 integration exit blockers and approved narrow correction

**Status: correction APPROVED and implemented locally; G6 qualification INCOMPLETE.**
The owner directly answered “Approve the correction; implement and complete G6”
to the proposal at target `05c35d91bd2e3241543aa09b8aa9652dd7973174`.
See [approval](../gates/G6-SCOPE-CLEANUP-OWNER-APPROVAL.md) and
[implementation/parent handoff](../../G6-CORRECTION-STATUS.md).
The actual target results below remain the unchanged pre-correction evidence;
they are not results of the new implementation. Public SDK 0.1.0 and frozen G1
stay unchanged.
The previous candidate `758610b` was approved and implemented; this is not a request
to approve it again or to release the historical SCP tool gate.

## Actual target evidence

Target: `/home/alica-dev/AlicaV2`, pinned Node 24.21.0.

- Initial integration build exposed eight TypeScript errors. These were fixed with
  explicit required-value validation and actual mandatory registration tracking,
  not non-null casts or invented payload defaults.
- Build and typecheck passed.
- `node --experimental-vm-modules --test tests/ipc/sdk-bookkeeping.test.mjs tests/ipc/host-sdk.test.mjs`
  passed all 19 tests, including unchanged-consumer inproc/IPC factories and real
  signed-Host confinement and delayed-continuation cases.
- After formatting the changed files, the then-current `npm run check` passed,
  including all 67 IPC/native/component tests. This predates the new regressions.
- New `tests/ipc/scope-completion.test.mjs` executes identical signed provider
  source and assertions in both factories: **3 inproc passes, 3 IPC failures**.
  These are normal `.test.mjs` exit-gate tests, not skips or excluded experiments.
  The current source tree therefore is NOT a green G6 exit candidate.

- A final full `npm run check` on the source including the new regressions
  exited 1 with **73 IPC/native/component tests: 70 passed, 3 failed, 0 skipped**.
  Its three failures are exactly the paired IPC regressions below. Earlier stages
  (including build, typecheck, SDK/API checks and native build) completed.
- `git diff --check` passed. `git diff --exit-code 758610b -- specs
  packages/acap-types packages/plugin-sdk tests/sdk docs/g6/review` was empty:
  frozen specifications/public SDK/review artifacts remain unchanged.

Final full-check evidence: `evidence/g6-runtime/host-integration-exit-check.log`
(SHA-256 `8271d7daf65a11c3e0e25adb2d7efc45443f726a1f6dd0077530dbed5edfc88f`).
Paired regression evidence SHA-256:
`62a973726d9646bcaa299c47e80f3c7c9a4bebdab107fb51221bcec359974926`.

Raw evidence:
- `evidence/g6-runtime/host-integration-build.log` (initial compiler failure)
- `evidence/g6-runtime/host-integration-test-1.log` (19 passes after fixes)
- `evidence/g6-runtime/host-integration-full-check-2.log` (pre-regression full pass)
- `evidence/g6-runtime/scope-completion-test-1.log` (first two paired failures)
- `evidence/g6-runtime/scope-completion-test-2.log` (all three paired failures)

## Reproduced failures

| Regression | Required/inproc result | Actual IPC result |
|---|---|---|
| Two asynchronous rollback cleanups on one invocation; the slower sibling performs a legitimate self-call after the faster sibling finishes | `healthy`; no failed disposers | `CANCELLED` |
| Call `child.log(...)` from a root handler | Audit scope is the child's ID | Audit scope is `root` |
| Start `child.effect(...)` without registering cleanup, destroy the child, then resolve acquisition while the root invocation is still live | Reject `FAILED_PRECONDITION` | Returns success `acquired` |

The cleanup failure confirms that an endpoint-global mutable inline-parent stack
cannot authenticate independently overlapping callback ancestry. Finishing one
logical callback must not cancel an unrelated sibling. Scope logging currently
has no scope field on the log request. Zero-cleanup acquisition currently has no
broker recheck at completion, so endpoint liveness is insufficient.

## Owner-approved bounded correction

### 1. Scoped log request

Retain the same work-lane `request` envelope and `kind: "log"`, but require:

```json
{"kind":"log","wireId":1,"scopeId":"child1","scopeGeneration":1,"record":{"level":"info","event":"checkpoint"}}
```

Body is closed. `wireId` and `scopeGeneration` use the existing positive-safe-
integer definition; `scopeId` uses the existing bounded private ID definition;
`record` retains its existing exact closed schema. Broker verifies the immutable
receiving endpoint, registered provider-owned scope identity/generation and live
Host context, then calls that context's log. The scope fields do not identify a
caller, grant or causal parent, and never widen authority. Result remains the
existing correlated `control/ack` or `control-error`.

### 2. Non-mutating scope validation

Add exactly one closed work-lane request body:

```json
{"kind":"scope-check","wireId":2,"scopeId":"child1","scopeGeneration":1}
```

Reply uses existing correlated `control/ack` or `control-error`. No new resource,
callback, effect slot, grant, scope, endpoint or audit log entry is allocated by
this check. Resolve the broker's provider-owned scope object and require matching
generation plus the same current Host liveness checks used by inproc `effect()`.
Run before acquisition and after successful acquisition, within the existing
causal endpoint/deadline. A failed completion check goes through the existing
reverse rollback path and must not return the acquired value. Do not substitute
an effect registration, fake secret lookup, scope creation or detached task.
The extra round trips share the existing 64-pending/byte/frame bounds.

Both requests remain forbidden on the control lane. This extends the closed
message contract, so it must not be slipped into the approved v1 schema silently.
Approved negotiation: private protocol minor **2**, mandatory feature
`wire.scopevalidation` in both hello and accepted, in addition to the three
existing required features. Reject peers missing these semantics; no fallback to
root-scope logging or unchecked acquisition. Public SDK version remains 0.1.0.

### 3. Cleanup ancestry attached to actual descriptors

Stop inferring a cleanup parent from the current endpoint-global mutable stack.
Dispatch each inline cleanup over its own broker-issued work descriptor with a
broker-owned WorkContext whose parent is the actual release-request context.
The first work message can remain the existing `effect-cleanup` body; its
`effectId`/`callbackId` identify the bounded owned callback, never caller authority.
Do not add a peer-asserted `parentId` or trust an ambient JSON ancestry token.

Separate siblings must have separate authenticated endpoints and sibling
WorkContexts; only a cleanup genuinely requested on a cleanup endpoint becomes a
nested child. First-selection/coalescing remains per effect. Revalidate callback
binding across endpoints and preserve the registration-reply/cleanup race rules.

Use the existing bounded nested admission budget for invocation-triggered inline
cleanup, not a new unbounded pool or a claim that no descriptor was allocated.
Keep four ordinary slots, four nested slots, one lifecycle slot, global bounds,
FIFO ordinary queue, depth eight, and one physical stateful provider unchanged.
Normal scope/unload cleanup retains its reserved lifecycle ordering. Charge queue,
offer and dispatch time to the selected deadline; never renew it at handover.
Exhaustion must fail finitely before dispatch and roll back reservations exactly
once, without stranding a disposer. The worker must distinguish an authenticated
first cleanup dispatch on this descriptor from ordinary invocation dispatch.
This approved correction revises v1's same-endpoint inline-cleanup implementation
strategy; it is not permission to relax R2 authentication or concurrency.

## Required acceptance for this correction

- All six existing paired regressions pass unchanged, including closed-child log
  rejection, without changing their assertions, replacing IPC, or skipping cases.
- Add closed-schema, missing-field/feature, wrong-lane, foreign/stale scope,
  correlated-result, and scope-check no-resource-side-effect tests.
- Separate physical cleanup sibling/parent routing, nested callbacks, cancellation,
  first-selection races, expired queued cleanup, capacity exhaustion and FD release
  receive real runtime tests. Repeated release never dispatches a second callback.
- Full original G6 hostile/capacity/recovery/reentrancy matrix and clean-source
  verification remain mandatory; six regression passes alone are not G6 exit.

These additional wire fields/messages and separate cleanup descriptors are now
implemented in the synchronized local correction. The parent still must transfer,
format, build/typecheck and execute the exact corrected candidate. No runtime
success is claimed before that output. The integration candidate remains explicitly
incomplete until the full required qualification and clean-source gate are green.
