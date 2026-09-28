# Phase4 Decision Service — qualified review candidate

Provider-neutral Decision Service, neutral reference provider and TypeSafe Jev adapter, exercised through the public Host with an unchanged SDK/Catalog-only external author. Actual Noul/Choice/Score/mixed succeeded on configured jev-latest, resolved jev-1.13.0, with real usage and clean teardown. Independent parent technical review accepted publication (../../docs/phase4/FINAL-PARENT-REVIEW.md); actual publication/tag/readback remain pending. This is not owner acceptance or a self-review certificate.

Start with [acceptance](../../docs/phase4/ACCEPTANCE.md), [actual evidence](../../docs/phase4/EVIDENCE.md), [offline reproduction](../../docs/phase4/REPRODUCE.md) and [completion status](../../docs/phase4/PHASE4-COMPLETION.md). Full governing plan/amendments remain retained. Architecture/contract/mapping/privacy/limitations are in [docs](docs/ARCHITECTURE.md).

## Safe default: offline only
Use pinned Node24.21.0/npm11.19.0 and a populated public npm cache. From repository root:

```sh
export npm_config_offline=true
npm ci --offline --ignore-scripts
npm run build
npm run typecheck
sha256sum -c docs/phase4/evidence/FINAL-SOURCE-SHA256SUMS
node --experimental-vm-modules --test-reporter=tap --test services/decision/tests/contract/*.test.mjs services/decision/tests/provider/*.test.mjs services/decision/tests/external/*.test.mjs
node services/decision/tools/external.mjs
node services/decision/tools/external.mjs --continuation-fixture
```

These exact final-source paths were exercised:54/54 tests; both packed public Host fixtures complete with0authenticated requests. Default fixture includes neutral and synthetic Jev substitution plus grant denial; continuation fixture uses fresh private temporary ledger/dummy key and four synthetic POSTs. No real key/ledger or discovery is accessed. Separate author/operator installs prove author cannot resolve Kernel/Decision/testkit. Same author digest f9326697f7c6a3998a728304285e9879311d319ffe61c4891231c303ca044167. Local signed shells and trustVerified=false Catalog limitations are explicit, not hidden.

The final executable/declaration/JSON source manifest has46 files, digest f85caf078e778a0b2b8984a4f1abff2a64088bc599709af327ecfa71e58b52ab. Old38-file evidence remains historical. The fresh clean overlay reproduction is not yet a public committed reproduction; follow the release readback after publication rather than assuming the Phase3 base contains Phase4.

## Live authority is CLOSED
Original6/6 slots are consumed: failed discovery, one explicitly authorized diagnostic, then four successful evaluations. No more API requests/diagnostics/retries/init/replay for regression, reproduction, final review or release. Do not run --live, --continue-live, --diagnostic-once, --initialize-once or the one-shot continuation proof driver. Do not reset/delete the ledger, evidence or key. An independent future deployment needs independent authority/configuration/secret reference/budget; it cannot renew this phase's grant.

See evidence/FINAL-VERIFICATION.json through the evidence guide for frozen-code purity and prior Phase1/2/3 MOCK regression provenance. Known accepted @alica/catalog dependency-check failure remains explicit, not repaired. No original Phase3 authority or live path, Hermes consumer, excluded integrations or Phase5.
