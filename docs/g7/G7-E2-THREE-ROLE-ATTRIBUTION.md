# E2 three-role receipt binding and structural attribution

This source slice adds verified receipt/source/output/map binding, strict malformed-receipt rejection, and exact R6 DWARF path compatibility. It is tested source, not native runtime or final G7 qualification.

## Tested changes
- Role-specific G6 `sources` / G7 `inputs`; ambiguous dual fields rejected. Optional provenance uses the same validated inputs.
- Duplicate JSON keys rejected recursively at receipt, binding and toolchain-lock decode sites.
- Raw source paths must be canonical relative POSIX spellings before normalization or opening.
- Existing mandatory source membership retained; no fictitious sandbox.h requirement.
- Debug path mapping is restricted to the exact R6 receipt identity and known build-root mapping. Historical default parser behavior and traversal/structural limits remain.

## Executed evidence
57 selected tests and 113 subtests passed in EACH normal and optimized Python mode; no failures/errors/skips. Complete selected debug, mapping, receipt, streaming and locations modules plus the selected dispatch/read-at-ownership bootstrap cases were exercised. This is not a full bootstrap/native suite. Test processes used Python -B, timeout30+5, AS256MiB, CPU15, FD64 and fsize1MiB.

The amended candidate was transferred and verified through normal terminal enforcement under owner-approved scope, then actually validated against unchanged historical G6 bridge/launcher and R6 ownership artifacts. Actual receipt/hash binding and full notice observation passed; observe includes DWARF structural-path attribution. There was no redundant independent DWARF rerun.

- Observe: 666129 bytes, 57 source records, 53 files.
- Observe SHA256: a4413e5ba83e30bacb41e6398df62264fb2a05ab84a43d9ee5c7b00409266369
- Amended result SHA256: 9aa320791127e8f53a1f10fb695787e0dabe94e8ec479f9c1b39388941a5d97d
- Binding SHA256: 3debd0302f7f220a5ec00ebdd282b0a615160992716c315bd6ac96f5341766e3

Parent independently rehashed protected originals, earlier candidate-area files and actual outputs after execution. All matched. Selected source bytes matched archive/receipt identities. No native code was loaded and no binary was rebuilt.

Detailed retained receipts, exact commands, tests and correction diff: `e2-attribution-fix/receipt-hardening-r3` in the governed control evidence area. Failed earlier tests and accounting discrepancies remain retained; they are not erased by this pass.

## Limits
Caller-provided trusted read-only custody and external resource bounds remain necessary. Receipt membership is mandatory known inputs plus declared inputs, not complete compiler dependency closure. Legacy absent recipe fields do not retrospectively prove build provenance. Optional provenance is hash equality, not independent proof of compilation. This is not hostile-filesystem/TOCTOU confinement, instruction provenance, legal/license approval, native lifetime/five-case/bootstrap qualification or final G7 acceptance. Existing consumed grants and NULL/signing/production boundaries are unchanged.
