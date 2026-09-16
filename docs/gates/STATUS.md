# Step-1 gate status

| Gate | Current record | Evidence |
|---|---|---|
| G0 | Historical technical closure delivered | G0.md and reference inventory; original approval history retained |
| G1 | Normative design delivery retained; G3 uses its frozen semantics | G1.md, completion clauses, design checks; historical acceptance wording is not silently rewritten |
| G2 | Owner explicitly authorized progression under the manual control alternative | G2-OWNER-DISPOSITION.md; host/CI evidence attributed to owner outputs |
| G3 | ACCEPTED by owner for candidate 9323a5c | G3-OWNER-ACCEPTANCE.md; exact-candidate foundation CI success confirmed by owner; documented limitations retained |
| G4 | ACCEPTED by owner for a0bd08d | G4-OWNER-ACCEPTANCE.md; exact-candidate foundation success confirmed by owner |
| G5 | ACCEPTED by owner for db74818 | G5-OWNER-ACCEPTANCE.md; exact-candidate foundation success confirmed by owner |
| G6 | Bounded-concurrency/reentrancy revision direction approved; revised ADR/schema review pending | G6-CONCURRENCY-DIRECTION.md; single-active candidate superseded as exit target; no runtime qualification |
| G7–G8 | NOT STARTED | No service integration or installer/recovery qualification claimed |

GitHub stays private. Required-check enforcement is unavailable on the current plan.
The approved process is clean-checkout checks, successful CI for the exact candidate,
and owner approval before acceptance/release. No automatic technical equivalence is claimed.
