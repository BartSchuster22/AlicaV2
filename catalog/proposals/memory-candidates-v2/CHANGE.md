# Bounded v2 redesign / change explanation / independent review

Owner approved investigation of truthful domain-level durability using existing public interfaces, not a Kernel change or durability downgrade. Parent sync current359/workflow32. Decision does not review/admit this revised draft.

## Why instance relabeling is rejected

Frozen packages/acap-contracts/src/runtime.ts:
- ContractProvider constructor246–249 rejects durable, independently of Kernel package trust rejection.
- unary268–288 builds an in-memory ledger from caller principal/scope/generation/capability/operation/CallOptions key; on a hit returns cached success OR error before the handler.
- unary301–310 retains both outcomes according to the policy; close255–257 clears all records.
- ContractSession.prepare392–408 authorizes through the Host and rejects CallOptions keys unless idempotency=provider; invoke531–542 checks authority/liveness before and after the handler.

Thus `instance` would not merely change a storage declaration: it can skip current domain authority resolution and replay an ambiguous transport error without attempting domain reconciliation. It would not prove durable domain actor identity across Host lifetimes. The proposed draft disables this cache instead of calling it durable.

Frozen Kernel trust.ts522–526 rejects durable descriptors and index.ts1451–1453 requires package-bound descriptor digest equality. No bypass or weaker bootstrap descriptor is used: diagnostic discovery, bootstrap release and actual provider all bind the SAME proposed v2 descriptor/digest, using existing accepted hostFixture inproc native composition. No alternate public binding, Host replacement or forged execution context.

Frozen SDK index.ts102–145 validates descriptors/handler sets and delegates provide; require147–152 wraps Host handles, call108–112 delegates. SDK does not add replay or authority. Prototype remains a private Python process adapter; no Python public platform.

## Exact API changes

Original immutable draft: URI@1, descriptor1.0.0, create idempotency=provider with durable/86400000 policy; CallOptions key fed to domain. Additive proposal: URI@2, descriptor2.0.0; create idempotency=none, policy absent, mandatory payload.requestKey string8..128. get/search input/output unchanged; all candidate outputs unchanged. Permissions, scopes, namespaces and release list unchanged (release empty). Catalog semantics now explicitly require durable domain replay for>=24h. Metadata/proposal describe this distinction.

This is a BREAKING major revision, not a compatible relabel. Original accepted design review remains attached only to original six-file packet. Independent reviewer must decide whether new representation preserves required service-level durability faithfully. Consumers must change major selection and move logical request key into payload. v1 CallOptions keys are rejected, not ignored. No silent aliases/version selection. Original descriptor file SHA2561962770c9bd93091ab644933c91167c43499c6d88e74815ba92daec0b67aaa84 stays unchanged.

No shared domain/Store/HTTP/product-provider files changed in this continuation. `phase51/redesign/prepare.mjs` generates a diagnostic leaf provider copy with only explicit payload-key validation/mapping and relative bridge path changes. The original adapter is still the unqualified v1 WIP. A future approved integration can apply the small mapping, not retain two competing platforms. Prototype exercises unchanged real candidates mapper/domain/SQLite provider, not an invented response stub.

## Actual evidence and finite review question

Public validators accepted descriptor/definition/proposal with release:false, releaseEntries0. Actual isolated public-Host diagnostic5pass0fail0skip,10565.985326ms; experimental VM warning only. Earlier diagnostic fixture failed because freshly issued child grant expiry exceeded its parent by milliseconds; corrected to equal captured expiry, not weaker grant validation. No frozen code change/test weakening. Prior baseline61/61, refactor61/61 and neutral5/5 remain as recorded, not rerun.

Review the four revised JSON files, SEMANTICS.md, this CHANGE.md, preparation/prototype/test sources and hash-bound evidence. Inspect the unchanged domain authorization-before-replay and Store transaction methods referenced by source hashes. Decide whether the generic API representation, major-version break, authority boundaries, minimum retention and ambiguity contract are acceptable without frozen structural change. Return a genuine distinct review record bound to proposal `phase51-memory-candidates-v2-domain-replay` if accepted; worker must apply existing reviewProposal API, not fabricate acceptance.

No transition, admitted snapshot, full M11/M12 qualification, final candidate review, source publication, owner acceptance or Phase5.2 is claimed. Next after independent review: integrate only approved mapping, generate actual evidence-backed Catalog admission and real selected-snapshot M7 validation in frozen sequence, then resume remaining bounded implementation/qualification. If review finds semantics cannot truthfully be preserved, stop and propose minimal explicit architecture change without implementing it.
