# G6 component checkpoint — NOT G6 exit acceptance

Base: c4391fcf91d3162fedf6485616bd7a6c094a0173 plus the component files
committed with this receipt. Dedicated ALICA V2 development target; pinned
project-local Node 24.21.0 and native toolchain. All previously recorded
transfer approval blockers were resolved; no preservation/archive retries.

## Executed on target

- Approved scheduler transfer, `node --test tests/ipc/scheduler.test.mjs`:
  8 tests passed, zero failures.
- Updated session/worker/reap files and narrowly scoped import exceptions
  transferred; `npm run build`, `npm run typecheck`, `npm run boundaries`:
  all exit 0.
- `npm run test:g6-native`: 48 tests passed, zero failures/skips/cancellations.
- Target project-local Prettier applied to changed TypeScript and tests.
- Full root `npm run check`: exit 0. Includes:
  - 169 baseline JS tests, all passed;
  - 193 specification tests, OK;
  - 135 G6 frame-schema checks;
  - 30 G6 design-model tests, OK;
  - 48 component tests, all passed;
  - build/typecheck/format, schema synchronization, dependency/license and secret
    scans, import boundaries, isolated conformance, SDK API and external SDK checks.
- `git diff --check`: exit 0.

Full check receipt: `parent-check.log` in this directory.
SHA-256: `30a83b0df730b4b3d7cf737bf0155959975355b8ce60b43ecac09fd07c3d3728`.
This log predates the documentation-only checkpoint edits; source was formatted
before that run. A clean-checkout receipt is separate if subsequently produced.
No independent private GitHub CI execution or exit acceptance is claimed.

## Evidence limits

The 48 component tests comprise native primitives, wire codec, scheduler,
reap observation helper and import-boundary regressions. Scheduler reentrancy
uses actual scheduler objects, not a full cross-process public SDK call chain.
Reap-helper success is not a physical-session fault-injection result. Existing
native process tests qualify only the previously documented native primitives.

Private session supervision and worker transport compile but do not yet have
complete integrated runtime qualification. Host/Trust IPC routing and the public
SDK broker/dispatcher are still missing and IPC remains fail-closed. There is
no unchanged-consumer inproc/IPC equivalence result, full hostile runtime matrix,
reconnect qualification or complete runtime resource measurement.

Two verified closed-schema/public-SDK gaps are documented in
`docs/g6/SDK-INTEGRATION-GAPS.md`: publication admission results and scope-owned
effect cleanup dispatch. No undocumented encoding, SDK weakening, or unapproved
wire-schema amendment was used to conceal them. G6 remains INCOMPLETE.
