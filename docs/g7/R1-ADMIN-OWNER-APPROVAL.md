# R1 admin amendment — owner approval

Owner instruction in Telegram, following the published decision brief at d9f0c026790a525d606e7d2e9a2687d52039c444:

> Approve A1+B1: explicit request half-close + separate v2 unknown-selection responses, continue and complete G7

This selects A1 and B1 of R1-ADMIN-OWNER-DECISION-BRIEF.md, including the specified separate endpoint/version routing, unknown knowledge/code semantics and known sequence/digest pairing. The historical brief remains preserved as the proposal on which this decision was made.

Authorized: explicit write-EOF sealing after exactly one complete request frame, no dispatch before EOF, invalid/unsealed transport closes without dispatch/response; separate supervision/admin-v2.sock with closed v2 request/response definitions; null/null unknown selection only as NEEDS_OPERATOR/CLEANUP_UNCERTAIN; zero/null known absence and positive/digest known selection. V1 response grammar remains unchanged and its unknown disposition remains connection close. Wrong-version routing must not dispatch. Both endpoints share custody, mutation exclusion, aggregate eight-connection cap and existing admission-based 30000 ms deadline. No automatic fallback/replay or restart authority from uncertainty. No numerical ceiling changes.

Approval authorizes implementation and continued G7 work, not fabricated completion, production signing, or final owner acceptance. Existing protected deployment/custody and licensing boundaries remain. Implementation and independent evidence are required; this record is not test evidence.
