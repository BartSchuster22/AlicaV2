# Public/offline reproduction — no live authority

Status: exact uncommitted final source has been reproduced and independent parent technical review accepted publication (FINAL-PARENT-REVIEW.md). Public branch/tag and committed reproduction still await actual delivery. Do not claim the Phase3 base alone contains Phase4. After publication, obtain the reviewed phase4/jev commit (or immutable phase4-jev-v1.0.0 tag after it exists) from https://github.com/BartSchuster22/AlicaV2. Verify the commit/tag reported by the release readback and the46-file source manifest below. This document does not assert the tag already exists or owner acceptance.

Linux, pinned Node24.21.0/npm11.19.0. Install those toolchain versions using the frozen development setup. Dependency preparation may require one ordinary `npm ci --ignore-scripts --no-audit --no-fund` to fill the public npm cache; that downloads dependencies, not TypeSafe data, and needs no TypeSafe key. The verified reproduction used a populated cache and npm offline mode throughout. No production data, secret or real ledger is required for any command below.

From candidate/release repository root, default provider-OFFLINE reproduction:

```sh
export npm_config_offline=true
npm ci --offline --ignore-scripts
npm run build
npm run typecheck
sha256sum -c docs/phase4/evidence/FINAL-SOURCE-SHA256SUMS
node --experimental-vm-modules --test-reporter=tap --test services/decision/tests/contract/*.test.mjs services/decision/tests/provider/*.test.mjs services/decision/tests/external/*.test.mjs
node services/decision/tools/external.mjs
node services/decision/tools/external.mjs --continuation-fixture
python3 tools/check-secrets.py
```

Expected actually observed results:54/54 tests,0fail/skip; both installed fixtures PUBLIC_HOST complete/0authenticated requests; default5synthetic and continuation4synthetic; unchanged SDK/Catalog-only author, separate author/operator installs and clean resources. Intentional denied default-fixture caller is FAILED with clean disposal; this is not a failed qualification. Public Host local signed-shell and unsigned EXPERIMENTAL snapshot limitations remain explicit.

Default external mode has no provider network. Continuation fixture uses only a fresh temporary private directory, disposable key/ledger and injected HTTP; seeded historical records are copies, not network requests. Runtime/install temp directories are cleaned by fixture code. Output is stdout unless an explicit fixture-only PHASE4_EXTERNAL_REPORT path is set. Do not overwrite the retained evidence; choose a new path if saving independent results. The docs' frozen hashes are qualification evidence, not permission to rewrite it.

Do NOT run --live, --continue-live, --diagnostic-once, --initialize-once or the one-shot verify-continuation proof driver as reproduction. Original authority is CLOSED at6/6; archived proof/evidence already exists and is intentionally not reset. No provider call may be repeated to get a fresh screenshot, test count, tag or release certificate. Do not remove the actual key/ledger/reports. An independent future deployment requires separately authorized secret reference, configuration and budget; it cannot borrow/refill this phase's grant.

Final executed local procedure used a fresh local clone of accepted0df9095dab900458d054dd3b7734dbfaeae9fba8 plus exact selected Phase4 roots; npm offline, build/typecheck, source digest check, these54 tests and both installed fixtures. Full output/hashes/path: evidence/FINAL-CLEAN.log and FINAL-VERIFICATION.json. The proof's source digest f85caf078e778a0b2b8984a4f1abff2a64088bc599709af327ecfa71e58b52ab includes the parent verifier directory correction contract/provider/external, not the failed unit/provider/external selector.

Frozen regression provenance: evidence/REGRESSION.log already exercised original required Phase1/2/3 paths (Phase3 MOCK only). Final frozen-source/Phase2 dependency-baseline comparisons are zero; no reason to rerun protected or live paths. Known inherited `python3 -S tools/check-dependencies.py` exits1 at @alica/catalog; not green/not repaired. Do not use a blanket check chain to renew old G7/Phase3 authority. No original credential/grant/ledger/launcher/supervisor access.

Publication plan after finite parent review: exact-path Phase4 implementation/docs commit, public branch/readback, committed offline reproduction, technical tag phase4-jev-v1.0.0 and immutable readback, separate docs-only main pointer to that tag, STOP. Existing release tags remain immutable; no Phase5 or extra acceptance gates.
