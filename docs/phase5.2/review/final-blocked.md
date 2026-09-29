# Phase5.2 independent finite FINAL REVIEW

Verdict: **BLOCKED_CONCRETE_FINDINGS**

Exact candidate: `1247195c2c78c091460159c8f83e0bb790b8d90f`
Implementation: `5d4a122797d42ef8599db7660783f8cccb0006cb`
Accepted baseline: `ad3df9bbd0a23aedc5edcd3eae8194e04152eebd`
Source archive: `/home/herman/g7-control/phase52-final-review-source.tar.gz`
Archive SHA256: `11526a9569e5f521523e0a0164968655fcb82eaddf2a62879e648562210b17af`

Independent reviewer, not implementation worker or parent design reviewer. Read the preserved parent design review as provenance; findings and executions below are independently produced. Reviewed against Rev1.1 and the approved DESIGN including F1, not a replacement architecture. Two bounded blocking findings; no implementation fixes made. D21 public publication remains intentionally pending and is not itself a finding. This report is not Owner Acceptance or permission to publish the blocked candidate.

## R1 — D13 required native isolation has not been proven

Severity: blocking acceptance-evidence gap.

Criterion: BUILDING-PLAN-Rev1.1.md:394–395 requires core qualification with Docker/Podman/socket **unavailable**; :745–751 repeats the no-Docker/Podman/socket native conformance requirement. This is stronger than not invoking containers.

Evidence:
- EVIDENCE.md:7 records `unshare -Urn` execution; :35 explicitly says container binaries are not proven absent.
- README.md:44–49 reproduces network-namespace execution and disclaims binary-absence certification.
- GATES.md:18 nonetheless labels D13 EXECUTED PASS scoped native.
- catalog/proposals/assurance-incidents/conformance.json:6 and admit.mjs:21 describe native/no-container evidence, not demonstrated unavailability.

A new user/network namespace does not remove executable paths, isolate the filesystem, or establish unavailability of filesystem Unix sockets. The reviewed packet does not show a minimal isolated runtime in which Docker/Podman executables and container-service sockets are inaccessible. Static absence of container imports and passing native tests are useful but do not satisfy this prerequisite. I did not inspect, connect to, modify or probe production sockets.

Bounded closure: the sole writer should produce hash-bound execution evidence for the core/native vertical slice in a disposable filesystem/runtime isolation where Docker, Podman and container-service sockets are unavailable, with an explicit safe prerequisite check inside that fixture. Preserve network isolation and frozen semantics. Do not manipulate production binaries/sockets, invoke the historical operational Doghouse, or weaken Rev1.1 to “not used.” Retain original admission evidence as history and supplement/correct gate claims truthfully; this reviewer did not change admission.

## R2 — canonical import accepts impossible overlapping COMPATIBLE incident histories

Severity: blocking domain/canonical correctness defect; reproduced.

Criteria: DESIGN.md:19 requires one active incident per exact correlation key, further FAILs incrementing it until a newer recovery resolves it, and only a later FAIL creating a new incident. DESIGN.md:37–39 requires continuation invariants and rejection of illegal transitions. Gates D10, D15, D16 and D17 rely on these guarantees.

Source:
- services/doghouse/contracts.mjs:37–60 validates each incident internally; :43 resets chronological comparison for each incident; :53 only tracks uniqueness among final non-RESOLVED incidents. No check orders resolved/active incident intervals against one another for the same understood correlation key.
- services/doghouse/core.mjs:92 imports the accepted records and commits them. store.mjs:13,19 uses the same relationship validator for durable state.
- core.mjs:73–77 enforces cross-incident ordering during live ingestion, but that does not reject already-impossible imported history; a sufficiently new signal continues it normally.

Actual reproduction, entirely synthetic:
1. Produce legitimate current-rule history: FAIL at T, RECOVER at T+10, then new FAIL at T+20. Export it.
2. Change only the new incident's failure time to T+5, updating its observed time, first/last/window timestamps and matching dedupe content hash. All IDs, references, scopes, rule versions and individual-incident ordering remain internally coherent.
3. Import into a fresh empty isolated domain. Expected: FAILED_PRECONDITION without mutation because the second incident starts before the first resolves. Actual: import succeeds with `COMPATIBLE:RESOLVED,COMPATIBLE:OPEN`.
4. Deliver authorized RECOVER at T+30. Actual: invalid history continues and commits, yielding `RESOLVED,RESOLVED`.

The second FAIL should have incremented the first incident, not created another. Thus current-rule occurrence/correlation history can be imported as COMPATIBLE even though it cannot be produced by the frozen rule. This is not a request to authenticate historical evidence cryptographically or redesign exchange.

Bounded closure: enforce cross-incident lifecycle/chronology for each exact understood scope/target/rule correlation, independent of array ordering, rejecting impossible overlap/equal-time/active-predecessor transitions atomically. Preserve valid recurrence, unknown-rule HISTORICAL_ONLY treatment and current local authorization requirements. Add focused negative import/store fixtures and a positive valid recurrence/continuation check. Reviewer supplies no implementation patch.

Reproduction fixture (retained disposable): `/tmp/phase52-independent-review-flX8sg/reviewer.test.mjs`
Source SHA256: `2bd7fb4a7b09b1b9b50596caa9c7a994a0e0999e0e1b63c63f37cb0b89d7ebf7`
Final actual log: `/tmp/phase52-independent-review-flX8sg/reviewer-final.log`
Log SHA256: `20dc873c924ce52bcd133c5b3348b835cdca5646b18116e8c146bf75d5b80f8c`

Run from `/home/herman/alica-phase52`:

```sh
unshare -Urn .tools/node-v24.21.0-linux-x64/bin/node --experimental-vm-modules --test --test-timeout=30000 /tmp/phase52-independent-review-flX8sg/reviewer.test.mjs
```

Final actual result: 4 tests, 3 pass, 1 fail, exit 1. The failed assertion is `illegal same-rule cross-incident transition accepted as COMPATIBLE`; it is the intended acceptance-negative test revealing R2, not a successful product test. The three passing independent probes cover current local target revocation after queue wait, public Host grant revocation cancelling a waiting acknowledgement without durable mutation, and expiration denying an already-bound public consumer.

For reconstruction after disposable-fixture removal, the essential negative test is:

```js
// Import fixture/error from services/doghouse/tests/fixture.mjs,
// contentHash from services/doghouse/contracts.mjs; use node:test t.
const a = fixture(t), b = fixture(t);
await a.domain.ingest(a.signal('first', 'FAIL', 0), 'observer');
await a.domain.ingest(a.signal('recovered', 'RECOVER', 10), 'observer');
await a.domain.ingest(a.signal('next', 'FAIL', 20), 'observer');
const x = JSON.parse(a.domain.export());
const o = x.observations.find(o => o.sourceObservationId === 'next');
o.occurredAtMs = a.clock.wall + 5;
o.observedAtMs = o.occurredAtMs;
const i = x.incidents.find(i => i.occurrences.includes(o.id));
i.firstObservedAtMs = i.lastObservedAtMs = i.windowStartMs = o.occurredAtMs;
x.dedupe.find(d => d.observationId === o.id).contentHash = contentHash(o);
assert.throws(() => b.domain.import(JSON.stringify(x)), error('FAILED_PRECONDITION'));
```

## Independent verification and positive assessment

- Live HEAD equals the exact candidate. Candidate versus implementation diff is only five documentation/evidence/verification files, 148 added lines; no runtime changes. Baseline-to-candidate scope is 91 additive files. Frozen packages, Foundation, Decision, MemoryV4, phase5.1 and root package/lock/toolchain paths have zero tracked diff. Working tree still shows only the two declared untracked generated Catalog schemas.
- Verified the archive SHA256 and compared every regular archived file against `git show` at the candidate: 60,368 files, zero mismatches, zero extra files. This binds the archived regression logs as well as product source to the actual reviewed candidate.
- Executed qualification verifier: all 46 hashes verified. Independently verified the original admission's 10 conformance hashes. No admission workflow was run or rewritten.
- qualification.json SHA256: `afe82c64cc7e14b048d4c548e9891440be43071a81aab82e9f35cac2fd5be87f`.
- Read actual admission workflow and independently consumed the existing snapshot using frozen Catalog, asserting manifest pin equality and one entry. Snapshot digest: `sha256:6cad8c7fe21bc2f93f723eff0e75677e2f4f07ffb978e0e28306f4ddb8a8397d`. EXPERIMENTAL/trustVerified=false is not cryptographic Owner approval. D13 qualification deficiency remains despite structurally valid admission records.
- After source inspection, independently ran public.test.mjs, exchange.test.mjs and continuity-faults.test.mjs with qualified Node in a fresh network namespace: **24 passed, zero failed**, exit 0. Includes real public Host/SDK calls/events, restart, stopped backup, authority-free exchange, current duplicate authorization, historic-rule disposition, acknowledgement collisions, malformed/inconsistent exchange rejection, child exit before/after rename, responsive shutdown retaining ownership, and cancellation during commit. No historical operational tests were invoked.
- Inspected all five domain/store/native/adapter/contract modules and the complete new test fixtures. Source enforces exact local producer/instance/generation/scope/target authorization before duplicates, separately mapped caller identity/data-scope permissions, durable observation-content conflicts and actor/scope/request acknowledgement collisions. Public Host supplies trusted identity; direct native injection remains operator-trusted, not a network authentication boundary. Independent queued revocation and expiry probes above supplement candidate tests.
- No automatic recovery from silence, drops, stale coverage, failed store or missing matching incident. Current-rule resolution needs an authorized newer recovery. Self-health is truthfully described as local registration/receipt/freshness, not instantaneous broker liveness or fleet health.
- Store writes group authoritative state with temp write/fsync/rename/directory fsync. Post-rename uncertainty makes the store unavailable; no stale success or automatic ownership breaking. Crash ownership clearance in tests follows actual exit of the fixture's own child only.
- Capacity checks reject rather than evict retained observations/incidents/dedupe. Local budgets and monotonic checks implement the approved cooperative F1 interpretation. Postcommit timeout/cancellation does not fabricate rollback; incomplete shutdown stays unavailable and retains ownership. Hard fsync preemption, power-loss certification and wall-clock 24h qualification are not claimed.
- D18 independent consumer source/test inspected: separate offline package install, SDK-only source import, negative Kernel/testkit/Doghouse package resolution, admitted snapshot descriptor and actual get/list/acknowledge. Used hash-bound existing execution evidence; did not rerun its npm packaging or a broad regression suite.
- D19: read both actual retired MemoryV4 v1 logs. The same three selectors fail at the same discovery/setup FAILED_PRECONDITION stage on candidate and accepted-baseline fixture. Baseline log uses candidate package builds, but those packages are byte-unchanged against the accepted baseline; that is not evidence of a new regression. Current v2 eight passes and inherited Catalog dependency failure are reported separately, not turned green. No frozen repairs or live-authority renewal observed.
- D20 tracked purity verified; new source does not import operational Doghouse or add executor/control/probe/LLM/production integration. No production operations were performed by this reviewer.

## Evidence honesty / nonblocking notes

The first reviewer expiry probe had an invalid fixture assumption: the existing public fixture overrides supplied expiries to one fixed future time; advancing its Host clock instead produced DEADLINE_EXCEEDED. A second attempt to reissue the same grant ID produced CONFLICT. Both were reviewer-fixture errors, not candidate defects. Final corrected probe issued a distinct short-lived synthetic child grant through the existing public Host API, waited for real expiry, and passed. Only isolated disposable reviewer code was changed.

`git diff --check BASELINE CANDIDATE` returns exit 2 for whitespace in preserved raw failure logs: evidence/d4-initial-fixture-failure.log:19,22 and evidence/domain-first.log:35,37. This differs from a clean-working-tree `git diff --check` assertion. Not a product blocker and not a reason to alter raw evidence; qualify the check's scope if repeating that claim. FUTURE_WORK only: improve source readability/test naming if desired, without reopening accepted architecture.

Other limitations already stated by the candidate remain caveats, not new blockers: historical semantic mapping rather than old-file-format compatibility; no manual resolution/annotations/probes/remediation; cooperative I/O; no cross-version migration qualification; no public health transport; no production adoption. Do not broaden this finite review into optional hardening.

## Handoff boundary

Parent may direct the sole implementation writer to close R1/R2 and obtain focused re-evidence/review for the new exact candidate. This report does not authorize a frozen contract modification or production action. Technical publication remains blocked for this candidate; after actual clearance, the separately authorized D21 publication/anonymous exact-source verification may proceed, followed by STOP for Owner Acceptance.

Reviewer did not acquire/probe/release the parent's lease, update continuity, invoke MemoryV4/SSH/providers/production endpoints, start subworkers or cron, publish, tag, or edit implementation. Sole persistent writes are this review and its companion JSON; other writes were isolated disposable test fixtures/state.
