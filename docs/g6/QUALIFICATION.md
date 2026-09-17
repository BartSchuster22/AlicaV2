# G6 qualification

**Clean-source result:** exact candidate `ea38b4a9cd406ff75ef491e0aecca664b54d1c91` passed the complete `npm run check` in `/home/alica-dev/AlicaV2-g6-clean`: 169 baseline JavaScript tests, 193 schema tests, 30 design-model tests, and **160/160 IPC/native tests, no skips**. The raw exact-commit receipt is `evidence/g6-runtime/clean-source-final.log`. Earlier checkpoint counts below are historical, not the final suite total.

The runtime implementation and twelve-area matrix are documented in
[FULL-QUALIFICATION-LEDGER.md](FULL-QUALIFICATION-LEDGER.md), with raw execution
receipts under `evidence/g6-runtime/`. That ledger supersedes earlier test-only
and pending-matrix handoff notes; historical failures remain preserved.

## Implemented closure

* Bounded production recovery with 1/2/4/8-second backoff, fresh identities,
  trust/lifecycle cancellation, no old-handle rebinding and no mutation replay.
* Actual reap governs disposal and capacity release; unreaped processes remain
  quarantined and cannot be reported as DISPOSED.
* Normal cancellation, deadline expiry and read-only scope-check retirement
  preserve unrelated work. Unanswered mutations and malformed transport still
  fail closed.
* Pre-offer authorization/deadline rejection remains logical. Offer budgets are
  validated before reservation; original broker deadlines remain authoritative.
* Stream schema failures retain CONTRACT_MISMATCH and first-terminal behavior.
* Resource diagnostics run inside sealed test workers without weakening the
  production non-dumpable sandbox.

## Verification and publication

The original six scope-completion tests, frozen public SDK/specifications and
native sandbox are unchanged. The shared consumers use identical assertions
on in-process and IPC routes, and print source hashes in their receipts.

The complete checkpoint passed `npm run check`, including 156 IPC/native tests
without skips. Twenty repeated dual-route consumer runs passed. Four additional
buffered event grant/scope tests subsequently passed as part of the 14-test
production-closure suite. Final publication requires the expanded complete
pipeline on the exact committed candidate in an independent detached worktree,
with separately installed dependencies and no copied `dist` directories.
The final execution/publication receipt records that candidate's commit and
full-suite totals; prior logs must not be relabelled as that receipt.

## Formal gate

`docs/gates/G6.md` continues to govern exact-candidate CI and owner acceptance.
Local/target success does not substitute for an unobserved private GitHub check.
No public repository conversion, frozen ABI change or sandbox relaxation is
part of this qualification.
