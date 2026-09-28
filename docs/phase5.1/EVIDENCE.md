# Phase5.1 technical evidence index

## Identity and review

- Qualified implementation: `ab09af5022ea81f9088b0b940645b4314543d422`.
- Final review: [JSON](FINAL-INDEPENDENT-REVIEW.json), SHA256 `aae8b7d8c982348d35f313e7d4dcef5f369d724f9c636f3c5dfac7a458ecd2f7`; [full assessment](FINAL-INDEPENDENT-REVIEW.md). Accepted with caveats, zero blockers; NOT Owner Acceptance.
- [Original final source verification](evidence/final-source-verification.json): 89 source hashes; original exercised archive `e2a390fca4cf1cb5df85667189428f5808b46838537edf758da263dfc2d2bcda`.
- Independent review packet archive SHA256 `59f630c692f760736fd7843b8a8e668c96bf4942992f4e43e2707ece1fb3050f`; 148 packet files verified by reviewer. Large generated archives are not additional Git source files.

## New anonymous public execution, not HTTP-only verification

[Provenance](publication/anonymous-source-provenance.json) binds anonymous HTTPS clone of the published implementation commit and 89 byte-identical source files. [Actual run record](publication/public-reproduction.json) binds all14 raw command logs and the newly exercised archive SHA256 `e59c1563a7e99ba7fee16b80363cc529169164e33cce6f29f1e3985b08527f4e`.

| Execution | Actual result / raw log |
|---|---|
| Fresh npm installation | exit0, [log](publication/public-npm-offline-install.log); cached public artifacts, fresh install, no install scripts |
| Build / typecheck | exit0, [build](publication/public-build.log), [typecheck](publication/public-typecheck.log) |
| Frozen public regression | 170 passed, [log](publication/public-frozen-regression.log) |
| Catalog dependency checker | inherited exit1 FAILURE, `AssertionError: @alica/catalog`, [unmodified output](publication/public-inherited-dependency-check.log) |
| Decision offline | 54 passed, [log](publication/public-decision-offline.log) |
| Packed fixtures | both exit0; [ordinary](publication/public-decision-packed.log), [continuation fixture](publication/public-decision-packed-continuation.log); no renewed live authority |
| Foundation | 41 ordinary and41 native passed; [ordinary](publication/public-foundation-regression.log), [native](publication/public-foundation-native.log) |
| New Python environment/public install | exit0, [venv](publication/public-venv.log), [install](publication/public-python-public-install.log) |
| MemoryV4 Python | 78 passed, 1 inherited warning, [log](publication/public-python-regression.log) |
| Public-Host vertical slice/SDK consumer | 8 passed, [log](publication/public-integrated-public-host.log) |

Run record status is PASS_WITH_INHERITED_FAILURE, not universal green. Its `publication:false` says the unchanged test helper itself does not push; it does not negate the independently recorded anonymous public source origin. Frozen Foundation helper strings saying working-tree candidate are also unchanged helper labels: the enclosing provenance binds the actual public source. Original logs/receipts are not rewritten to cosmetically change historical text.

## Reused evidence, explicitly not rerun wholesale

[MemoryV4 native8](evidence/native-v2.log) and [native Python78](evidence/native-python.log) are prior actual strict no-container evidence. Exact qualified product/tooling/Catalog identity justifies reuse. The final reviewer inspected isolation, actual process cleanup/error handling, same-record parity, durable transaction/replay and graph semantics; independently reran17 exchange tests in2.47s and bounded secret check exit0. This is finite evidence, not an exhaustive security certification.

[Real admitted M7](evidence/admitted-m7.json), [Catalog release/admission](../../catalog/releases/phase51-memory-v2/), immutable v1/v2 review packets, original failure evidence and [finite regression matrix](REGRESSION-MATRIX.md) remain unchanged. Genuine v2 review receipt SHA256 `7f1e21c2477a27f8514b9bbee21ac00714453df5087601f663361bc3b92bd917`.

## Final transport verification and limitations

The publisher must verify anonymous annotated tag object and peeled commit, branch/main exact commits, source/raw release links, all original frozen refs against [pre-publication inventory](publication/origin-before.txt), and a separately executed focused exchange fixture from fetched exact tag source. The separate main commit must change README only and preserve its previous body/links. Those post-transport results cannot exist inside their own immutable pre-transport commit; the publisher records them separately with hashes.

Catalog remains experimental; trustVerified=false; M7 EXECUTED/backup/migration NOT_TESTED remains. Retention is25h-aged fixture, not24h wall-clock soak. Fresh-domain graph omits same-domain authoritative ledger and artifact bytes; no authority import, backup substitution, production migration, second provider or additional qualification claim. VM/Python warnings, inherited whitespace/dependency failures, frozen Phases1–5.0 and closed grants remain. No Owner Acceptance or Phase5.2.
