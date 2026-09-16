# ALICA V2 — Project-Initiation Assessment and Step-1 Building Plan

**Date:** 16 September 2026  
**Status:** Proposed for owner approval — implementation NOT started  
**Repository:** https://github.com/BartSchuster22/AlicaV2  
**Primary development VPS:** 167.233.135.142, SSH port 22; existing hostname `ALICA-v1`  
**Immediate scope:** Kernel → ACAP → SDK, independently qualified as a standalone substrate  
**Decision owner:** Project owner; implementation agent prepares proposals and evidence, not self-approval of architecture.

---

## 1. Executive assessment

ALICA V2 should be built as a new capability-oriented substrate, not as a refactoring of the existing ALICA service deployment. Its trusted Kernel establishes identity, lifecycle ownership, scope isolation, capability resolution and enforcement. Replaceable plugins implement functionality above that boundary; consumers bind to versioned ACAP contracts rather than provider internals.

The supplied plan has the right strategic direction: independently prove the substrate, then integrate higher-level systems. Its principal weakness is that it combines Step 1 with a much larger migration roadmap and leaves several security and interoperability semantics unspecified. This report separates those scopes and introduces explicit decision, implementation and acceptance gates.

**Recommendation:** approve a lean, specification-first Step 1, with a proposed TypeScript implementation and language-neutral JSON contracts. Do not make Cordis, DeepSeek Harness, Hermes, Docker, a database or an identity service a mandatory Kernel dependency. Runtime/language selection remains an ADR decision, not an already approved fact.

The dedicated VPS has been accessed and inspected read-only. It is a usable starting point for development. Repository SSH authentication works and the existing repository has been cloned there. No application runtime, dependency stack or V2 implementation has been installed or written.

### Current readiness

| Area | State | Qualification |
|---|---|---|
| Supplied V2 plan and initial directive | Reviewed | No separate concept specification was supplied in this conversation |
| Public V1 DSH reference | Reviewed at a fixed commit | Documentation, manifest, packaging/build and acceptance code reviewed; not a complete audit of service source |
| DeepSeek/Cordis inspiration | README and primer reviewed | Design reference only; no adoption or execution |
| VPS SSH access | Verified | Host fingerprint checked against owner-provided fingerprint |
| Repository authentication/read access | Verified | `git ls-remote` and clone succeeded using the VPS deploy key |
| Repository write access | Owner enabled write access | Must be verified by a real documentation push; do not infer it from clone success |
| Minimal environment | Assessed and proposed | Git/Python present; application language tooling deliberately not installed |
| Privileged host security assessment | Incomplete | Account cannot run passwordless sudo; firewall/effective sshd policy require owner-assisted inspection |
| Implementation readiness | Conditional | Requires owner approval and resolution of blocking ADRs |
| Step-1 acceptance | Not run | All implementation gates below are future work |

### Hard stop

Delivery of this report is not authorization to start implementation. After documentation is delivered/version-controlled, stop for approval. Even a synthetic Echo Kernel prototype belongs to the implementation phase and must wait.

## 2. Architecture and objectives

### 2.1 Guiding rules

1. Keep the trusted Kernel small enough to inspect, explain and test.
2. Put a function above the Kernel whenever trust, lifecycle integrity, scope isolation and capability resolution remain intact.
3. Make provider choice explicit, deterministic and inspectable.
4. Communicate through versioned capability contracts; prohibit imports of another provider's implementation.
5. Associate every registration, subscription, call handle and managed resource with an owner and scope.
6. Validate trust, compatibility and authority before activation or invocation.
7. Preserve standalone operation without an ALICA central runtime service.
8. Treat documentation, rejection behavior, cleanup and recovery as deliverables, not follow-up work.
9. Never equate a manifest declaration with enforcement or an acceptance summary with independently reproduced evidence.
10. Keep V1 reference material outside the V2 runtime dependency graph.

### 2.2 Proposed architecture

```text
Cell operator / local CLI
        |
        v
Trusted Cell bootstrap and immutable trust configuration
        |
        v
Kernel: scopes + lifecycle + registry/resolver + policy enforcement
        |                       |
        |                       +-- bounded audit/event mechanisms
        v
ACAP broker and public contract boundary
        |
        +-- in-process transport -- trusted synthetic providers
        |
        +-- authenticated local IPC -- isolated synthetic provider process

Public SDK and generated clients/providers sit above public contracts.
Build, packaging, code generation, release signing and backup orchestration
are tooling around the Kernel, not business logic inside it.
```

The runtime dependency order and the specification order differ: Kernel is the runtime foundation, but ACAP contracts must be designed with its API before either is implemented.

### 2.3 Kernel inclusion/exclusion test

| Responsibility | Minimum Kernel responsibility | Above/outside Kernel |
|---|---|---|
| Cell identity | Validated local identity and trusted bootstrap | Enrollment UI, fleet identity, billing |
| Manifest | Structural validation and verified activation input | Authoring, publishing, catalogs, generators |
| Capabilities | Registry, resolution, invocation enforcement | Domain implementations and product APIs |
| Scopes | Ownership, visibility, revocation and teardown | Workspace/team product model and UI |
| Lifecycle | State machine and bounded cleanup | Deployment orchestration and dashboards |
| Grants | Deny-by-default enforcement and revocation | External authorization integrations and policy editors |
| Trust | Verification against operator-controlled trust roots | Signing service, CI provenance production, marketplace |
| Secrets | Scoped references and minimal access mediation | Full secret-management service and rotation UI |
| Events | Bounded, scoped, owned delivery primitives | Durable broker, analytics, workflow engine |
| Audit | Security-relevant record emission and defined failure policy | Search/indexing, long-term archive, dashboards |
| Transport | Public transport interface and required enforcement hooks | Remote federation, gateway, network management |
| Persistence | Only explicitly required Cell/trust/lifecycle state | General database, memory, sessions, storage products |

## 3. Scope and document assessment

### 3.1 Inputs received

- `ALICA_V2_Kernel_ACAP_SDK_Step1_Building_Plan.md`, including the 25-section substrate/migration roadmap.
- The owner's complete Initial Project Directive, including repository, minimal environment, documentation and approval requirements.
- Later owner instructions specifying the rebuilt VPS and requesting this assessment and Markdown deliverable.

No additional V2 architecture concept, canonical ACAP descriptor, manifest schema or formal threat model was provided. Their absence is recorded rather than filled with implied approval.

### 3.2 Strengths retained

- Fresh implementation with V1 as evidence rather than an architectural dependency.
- Lean Kernel and replaceable providers.
- Synthetic provider substitution before real service integration.
- Explicit lifecycle, scope, grant and negative security tests.
- Public SDK and an independently implementable provider contract.
- Online/offline standalone qualification.
- Data authority and reversible migration principles for later phases.

### 3.3 Clarifications and corrections

| Issue in supplied plan | Resolution proposed here |
|---|---|
| Step-1 title includes detailed service migration phases and milestones | Step 1 ends at substrate acceptance. Migration sections are deferred context only |
| Immediate actions include prototype implementation | Owner's later directive takes precedence: report and approval first |
| G1 only explicitly blocks production migration | Strengthen it to block production Kernel implementation until normative minimum contracts are approved |
| SDK, ACAP runtime and Kernel responsibilities overlap | Define an import graph and separate public contract packages from implementation |
| Scope isolation can be confused with malicious-code sandboxing | Declare trusted in-process code; require OS-enforced isolation for hostile code |
| 'Unloading removes all effects' is absolute | Guarantee tracked Kernel-owned effects; specify cooperative plugin obligations and isolated-process termination for non-cooperation |
| 'Identical accepted profile bytes' could include identity/secrets | Keep signed profile/lock bytes identical; Cell identity, secret values and runtime paths remain separate local state |
| Gate G0 demands a complete V1 inventory | Pin the distribution baseline and list unresolved source/ownership facts; do not claim full V1 audit or import production data |
| Performance targets are unnamed budgets | Establish a reproducible measurement method and approve numerical budgets before qualification |
| `alicac` versus lifecycle CLI is unclear | Use `alicac` for contracts/conformance; define a separate Cell administration command in an ADR |
| Bundle/Profile terminology is underspecified | Bundle packages artifacts; Profile declares composition; resolution lock pins exact accepted artifacts and contracts |

## 4. Reference review: ALICA DSH 1.0

### 4.1 Baseline and evidence limitations

Public reference commit inspected:

`BartSchuster22/Alica-DSH@d3feafa9c03a0175ae3d702413f97e0e8f1634c9`

Manifest release version: `1.0.0-d6.independent-candidate.1`.

Reviewed materials include README, Operator, Data/Privacy, Security, Support, D6 independent acceptance, the full component manifest, acceptance matrices, publication source map, D6 GitHub workflow, offline bundle script, independent operator acceptance script and candidate build script.

This repository is a public distribution repository. Component sources are separately referenced by the manifest. The `alicactl` artifact is binary/non-UTF-8 and was not reviewed as readable source or executed. No V1 images were installed, no running V1 deployment was touched, and no V1 backup/recovery or signature verification was independently rerun.

**Consequently, this is a reference architecture and packaging review—not a fresh certification of V1 or a full application-code audit.** Source-level reuse decisions require separate access, licensing checks and review. No code reuse is authorized by this report.

### 4.2 Retain, redesign, replace or exclude

| V1 property/component | Classification | V2 treatment |
|---|---|---|
| Immutable artifact digests | Retain | Pin accepted packages, descriptors and profile locks |
| Signed manifests and fail-closed verification | Retain principle; redesign implementation | Small verifier with explicit trust bootstrap, rotation, revocation and expiry semantics |
| Checksum-bound offline bundle | Retain | Complete, independently verifiable runtime and artifact inventory |
| Independent online/offline acceptance | Retain and strengthen | Prove the stated disconnection boundary and store immutable evidence |
| Idempotent/no-op install | Retain | Reinstall exact accepted profile without mutation |
| Local secrets and redacted evidence | Retain | No embedded credentials or accidental log disclosure |
| Encrypted recoverable backups | Retain principle | Back up V2's actual state, not V1's service-specific ordering |
| Single authoritative owner per data domain | Retain | Use during later migration; no data migration now |
| Whole-Cell application dependency stack | Replace | Minimal substrate-only profile |
| `unify-api/v1` monolithic integration | Redesign later | Domain capability decomposition outside Kernel |
| V1 `alicactl` implementation | Reference only | New small V2 lifecycle tooling; no copying binary or V1 internals |
| Keycloak, PostgreSQL, Caddy | Exclude from Step 1 | Potential external infrastructure/adapters later |
| Hermes/Alica/Herman runtime | Exclude from Step 1 | Separately approved Step-2 work |
| MemoryV4, Doghouse, UniUI, AInbA | Exclude from Step 1 | Later plugins/adapters only |
| V1 licensing/edition machinery | Exclude from Kernel | V2 license decision required; preserve existing protected licensing work |
| V1 QA10 product suite | Replace for Step 1 | Substrate-specific tests; do not require ten application services |

### 4.3 Distribution-level authority inventory

This inventory reflects manifest declarations, not independently verified internal storage behavior or named human ownership.

| Component | Declared authority/state | Declared dependency boundary | Step-1 action |
|---|---|---|---|
| Caddy | edge/config | none | Reference only |
| UniUI | uniui/stateless | Unify API | Exclude |
| Unify Core | unify/core migrations | PostgreSQL, OIDC, MemoryV4 | Exclude |
| Keycloak | identity/Keycloak schema | PostgreSQL | Exclude |
| PostgreSQL | database infrastructure | none | Exclude |
| Alica Runtime | alica/native state | Unify, MemoryV4 | Exclude |
| Herman Runtime | herman/native state | Unify, MemoryV4 | Exclude; preserve original state |
| MemoryV4 | memory-v4/schema | PostgreSQL | Exclude |
| AInbA Anchor | ainba/data | framework-agent, MemoryV4 | Exclude |
| Doghouse Node | doghouse/state | Unify | Exclude |
| alicactl | lifecycle/state | none | Behavioral reference |
| operations-jobs | operations/job state | lifecycle read-only | Behavioral reference |

Human component owners, full schemas, restore dependencies and external integrations remain unverified. These do not justify delaying a new Echo substrate indefinitely, but a claimed complete G0 inventory must explicitly close them or approve a narrower reference-baseline gate.

### 4.4 Important findings from actual reference code

1. **Offline is a bounded claim.** The operator test disconnects the application network but still prepares host/control tooling. V2 must distinguish 'offline application installation on a prepared host' from 'provisioning an entirely blank machine without internet'. Both can be supported, but the acceptance claim must match the tested boundary.
2. **SBOM existence is not SBOM completeness.** The candidate builder has a Hermes-runtime branch producing an immutable-image-identity inventory with an empty dependency list. V2 needs component coverage and explicit completeness limitations, not merely a valid SBOM file.
3. **Provenance scope matters.** The candidate script emits publication statements; this is not automatically source-to-binary build provenance. V2 must identify real builder, source, inputs and artifact digest, and distinguish repackaging from compilation.
4. **Fresh keys per candidate do not establish long-lived trust.** The build script generates signing/metadata keys in-process. V2 needs operator-approved bootstrap roots and a deliberate rotation/recovery model rather than trusting a key just because it accompanies a bundle.
5. **An evidence branch name is not immutable evidence.** The workflow force-updates an evidence branch. V2 should bind each acceptance result to commit, artifact digest and immutable retained release/run evidence; a mutable branch may only index it.
6. **A declaration of zero blockers is not defect triage.** The operator summary contains fixed P0/P1 counts after assertions. V2 requires a reviewed issue register linked to actual failing tests and dispositions.
7. **Component labels can share artifact bytes.** Several component IDs reference the same image. Preserve the distinction among component identity, runtime artifact and capability identity in V2.

These findings are improvement inputs, not claims that V1 has been comprehensively audited or that its historical acceptance is invalid.

## 5. Inspiration: DeepSeek Harness and Cordis

Reviewed DeepSeek Harness README and Cordis primer. The repository HEAD observed during review was `0d1f50007f9bca3f52b06e1c3074fa14d5fb0720`; the pages were fetched from `master`, so this is a retrieval-time reference, not a verified content hash binding for those earlier fetches.

Useful ideas:

- Dependency-declared activation instead of manually ordered startup.
- Context-owned registrations and reversible effects.
- Typed event contracts and explicit dispatch semantics.
- Service access through stable abstractions rather than concrete imports.

Do not adopt by default:

- DeepSeek's agent harness, tools, model/session concepts or web UI.
- Framework-specific context keys as a substitute for versioned ACAP descriptors.
- Executable configuration expressions such as `!!js` in untrusted manifests.
- All event dispatch modes without an ACAP need and transport-neutral semantics.
- Vendored Cordis code without an ADR, license review and demonstrated reduction in trusted complexity.

Recommended initial approach: implement only the minimal owned-effects and dependency-resolution mechanisms needed by the approved contracts. Revisit reuse if evidence shows it is safer and materially simpler.

## 6. VPS and repository assessment

### 6.1 Verified host facts

Inspection used the restricted `alica-dev` account and read-only commands.

| Item | Observed result |
|---|---|
| Address / hostname | `167.233.135.142:22` / `ALICA-v1` |
| OS | Ubuntu 24.04.4 LTS, x86-64 |
| Kernel | `6.8.0-138-generic` |
| CPU | 4 logical CPUs |
| RAM | 7.6 GiB total; about 7.2 GiB available at inspection |
| Root filesystem | 75 GiB total; about 71 GiB available |
| Swap | None |
| Git | 2.43.0 |
| Python | 3.12.3 |
| Node/npm/Docker/Go/Rust compiler | Not found in inspected PATH |
| Timezone/time sync | UTC; system clock synchronized; NTP active |
| TCP listeners | SSH on all interfaces; local DNS listeners |
| Running services | Standard OS services in inspected systemd list; no ALICA application service shown |
| Account | UID 1000, group `alica-dev`; no supplementary groups |
| Privileged access | `sudo -n -l` requires a password |
| Repo checkout | `/home/alica-dev/AlicaV2` |
| Initial repo contents | README only, initial commit `a3334608221ff6e14fdce0e37ec18f41774e5808` |

These observations do not establish external firewall reachability, absence of every hidden process/file, patch currency or complete hardening. Non-root socket inspection also cannot attribute all processes.

### 6.2 Access and trust

- VPS host-key fingerprint was verified against the owner's supplied value before authentication.
- Dedicated SSH access key is separate from the GitHub key.
- GitHub host keys were obtained from GitHub's HTTPS metadata API and written to a dedicated known-hosts file; strict host-key checking is enabled.
- Repository deploy-key authentication and clone succeeded on the VPS.
- Private keys remain outside Git; do not place them in backups committed to the repository or report attachments.

### 6.3 Remaining host checks

Before changing host configuration, request an owner-assisted read-only capture of:

1. Effective sshd settings, including root/password access and allowed users.
2. Host and provider firewall policy; preserve the existing SSH session when changing rules.
3. Available security updates and reboot requirement.
4. Disk layout, filesystem/mount constraints and snapshot/backup facilities.
5. Any provider recovery console and restore procedure.
6. Whether isolated test guests or user namespaces are available for later acceptance.

No blanket passwordless sudo is required for ordinary development. Prefer owner-executed administrative setup or narrowly scoped administration after review. Do not grant membership in a root-equivalent container group without explaining its impact.

### 6.4 Minimal development environment

| Tool/component | Recommendation | When / reason |
|---|---|---|
| Git + OpenSSH | Use existing | Source control and authenticated transport |
| Python 3 | Use existing | Inspection and small development utilities; not a mandatory product dependency |
| Node.js + TypeScript | Proposed | Public typed SDK and explicit interfaces; exact maintained versions frozen in ADR after approval |
| Package manager | npm workspaces initially proposed | Avoid extra orchestrator; lockfile and exact build tool versions |
| JSON Schema validator | One maintained dependency | One normative schema dialect and common validation path |
| Test runner | Prefer runtime-native runner where adequate | Avoid heavy framework unless required by demonstrable tests |
| Formatter/linter/type checker | Minimal justified set | Consistency, boundary checks, reproducible CI |
| Cryptography | Runtime standard library / maintained vetted library | No custom crypto implementation |
| Container engine | Defer | Only if container transport/packaging is selected; local IPC can qualify first |
| systemd unit | Later operator packaging | Non-root Cell runtime, bounded restart and resource policy |
| SBOM/signing tools | Release phase | Pin and verify tool artifacts; separate build tooling from Kernel |
| PostgreSQL/Redis/Keycloak/message broker | Do not install | Not needed for synthetic substrate |
| Web UI/reverse proxy/public API server | Do not install | Local CLI and tests suffice |

Current resources appear sufficient for early compilation and synthetic tests; release/offline qualification needs measured disk budgets and clean test hosts. V1's 100-GiB free-disk floor is not automatically a V2 requirement. No swap change or resource upgrade is justified before measurement.

Environment preparation already performed: dedicated access, host-key verification, GitHub authentication setup and repository checkout. Language tooling, privileged hardening and packaging infrastructure are intentionally pending approval; this is not a fully provisioned build host yet.

## 7. GitHub integration and repository design

### 7.1 Deploy key information

- Scope: `BartSchuster22/AlicaV2` only.
- Location on VPS: `/home/alica-dev/.ssh/alicav2_github_ed25519` (private; never publish contents).
- Public-key fingerprint: `SHA256:M48ZnCmOB0iW5wY5PXE3tZUFZGpZO6Zz+a1vGLv1hCM`.
- Owner reports write access enabled; real push is the final write-access check.
- No broad personal token or agent-forwarded private key is required.

Remaining owner configuration: review branch protections, CI availability/budget, release permissions and repository license. Do not change repository visibility to work around CI limitations. Do not bypass protected branches; use a documentation branch if direct pushes are restricted.

### 7.2 Proposed repository structure

```text
AlicaV2/
  README.md
  LICENSE                         # owner-approved licensing decision
  SECURITY.md
  CONTRIBUTING.md
  .github/workflows/              # minimal checks; releases later
  specs/
    kernel/
    acap/
    manifests/
    schemas/
    examples/                     # positive/negative normative fixtures
  packages/
    acap-types/
    manifest/
    kernel/
    plugin-sdk/
    provider-sdk/
    consumer-sdk/
    transports/
    testkit/
    conformance/
  cli/
    alicac/                       # descriptor/codegen/conformance CLI
    cell/                         # local lifecycle CLI; naming by ADR
  examples/
    echo-provider-a/
    echo-provider-b/
    echo-consumer/
    echo-ipc-provider/
  tests/
    unit/
    contract/
    security/
    lifecycle/
    transport/
    integration/
    packaging/
    recovery/
    performance/
  docs/
    planning/
    adr/
    architecture/
    developer/
    operator/
    security/
    references/                   # source URLs, commits, digests, review limits
    decisions/
  tooling/                        # small necessary developer utilities only
  evidence/                       # redacted indexes/manifests; large artifacts external
```

Directories are logical boundaries, not an instruction to publish a dozen packages immediately. Create packages only when their public dependency boundary is proven useful. Do not create empty framework scaffolding merely to fill the tree.

### 7.3 Dependency rules

- `acap-types` and normative schemas never import Kernel, SDK implementations or V1.
- SDKs depend on public types/interfaces, not Kernel internals.
- Providers/consumers import SDK/contracts only, not each other's implementation.
- Transport adapters implement a public interface and cannot widen caller authority.
- Kernel never depends on an example provider or higher-level ALICA service.
- A testkit may implement the public Kernel interface without simulating guarantees it does not enforce.
- Test architecture boundaries automatically; a passing type check alone does not enforce them.

### 7.4 Commit and evidence discipline

Use small, coherent commits such as `docs: record Step-1 initiation assessment`, `spec(acap): define compatibility negotiation`, `feat(kernel): enforce scope-owned registrations`, and `test(security): reject revoked call handles`.

Each implementation change includes relevant tests and documentation. Significant decisions get an ADR with context, alternatives, consequences, status and supersession links. Do not rewrite published evidence history. Each gate record identifies commit, toolchain, test command, exit status, relevant artifact digests, known limitations and reviewer disposition. CI workflows use minimum permissions and pinned action revisions when implemented.

## 8. Decisions, ambiguities and risk register

### 8.1 Blocking decisions before production implementation

| ID | Decision | Proposed default / required outcome |
|---|---|---|
| ADR-001 | Language/runtime/toolchain | TypeScript with a maintained pinned Node runtime; ACAP schemas remain language-neutral |
| ADR-002 | Kernel boundary and reuse | Small new Kernel; no mandatory Cordis/Hermes/service stack |
| ADR-003 | Trust zones | In-process providers are trusted code; local IPC providers use explicit OS identities and restrictions |
| ADR-004 | Capability identity/versioning | Namespaced IDs, explicit contract version and digest, deterministic negotiation; never infer compatibility from name alone |
| ADR-005 | Scope/grant authority | Parent-bounded authority; immutable effective caller identity; revocable handles; deny by default |
| ADR-006 | Lifecycle/rebinding | Explicit states, bounded quiesce/dispose, no silent rebinding after provider loss |
| ADR-007 | Events/streaming | Minimal bounded ordered semantics, declared visibility, explicit overflow/cancellation behavior |
| ADR-008 | Trust bootstrap/offline | Operator-pinned root separate from bundle; explicit expiry, revocation freshness and clock assumptions |
| ADR-009 | Persistence/recovery | Define exactly which state persists and how identity/trust recovery works |
| ADR-010 | Packaging/platform | Ubuntu 24.04 amd64 initial candidate proposed; qualify before declaring support; local IPC required, container packaging conditional |
| ADR-011 | V2 license / source reuse | Owner decision; no automatic inheritance of V1 EULA or source copying |
| ADR-012 | Acceptance/performance | Numerical resource budgets and exact test-host/disconnection definition |

Plan approval can approve these defaults as direction, but normative specifications still need explicit acceptance before production Kernel implementation.

### 8.2 Risk register

| Risk | Impact | Mitigation / gate |
|---|---|---|
| Malicious same-process plugin bypasses broker | False isolation guarantee | Trusted-only in-process policy; isolated process for hostile code; G1/G6 |
| Lifecycle cleanup fails or hangs | Stale authority/resources | Owned resources, idempotent cleanup, reverse disposal, timeout/failure policy; G3/G6 |
| Resolver depends on registration timing | Non-reproducible behavior | Canonical ordering and locked selection; shuffled-input tests; G3 |
| Grants checked only at bind time | Revoked handle remains usable | Check authority at invocation and stream progression; G3/G4 |
| Cancellation mistaken for rollback | Duplicate/external effects | Explicit operation semantics and idempotency responsibility; G4 |
| Offline verifier needs network service | Standalone claim fails | Bundle required metadata; disconnection tests; G7 |
| Expired/revoked trust accepted offline | Unsafe activation | Fail-closed policy with bounded freshness rules; recovery ceremony; G7 |
| Descriptor digest insufficiently defined | Cross-language disagreement | Canonicalization vectors, duplicate-key rejection and numeric rules; G1/G4 |
| In-process object references leak into ACAP | Transport lock-in | Data-only public values, equivalent validation and errors; G4/G6 |
| Generic event bus becomes workflow engine | Kernel growth | Minimal event modes and no durable broker in Kernel; G1 |
| Supply-chain evidence overstates provenance | False confidence | Real build evidence and explicit SBOM coverage; G7 |
| GitHub/CI unavailable or private limits | Unverified releases | Report blocker, preserve private scope, use equivalent recorded local checks; G2 |
| One VPS mistaken for independent acceptance | Invalid G7 evidence | Two fresh test hosts, separate from dev state; G7 |
| V1 reference review expands indefinitely | Scope drift | Freeze relevant baseline; defer full service decomposition |
| Secrets leak through errors/audit | Credential exposure | Structured redaction and planted-secret tests; every phase |
| No privileged assessment | Unknown host controls | Owner-assisted inspection; do not describe host as hardened |

## 9. Normative specification inventory

All normative text uses MUST/SHOULD/MAY consistently, has a version/status, machine-readable schema where applicable, and positive and negative executable examples.

| Specification | Required content |
|---|---|
| `ALICA-KERNEL-API-v1` | Public interfaces, ownership, activation, inspection and supported extension points |
| `ACAP-CORE-v1` | Identity, descriptors, operations, type system, versions, negotiation, limits and canonical digests |
| `ACAP-ERRORS-v1` | Stable codes, safe details, retryability, correlation, transport normalization |
| `ACAP-EVENTS-v1` | Envelopes, schema, visibility, ordering, overflow and subscriber lifecycle |
| `ACAP-SCOPES-v1` | Scope tree, inheritance, visibility, destruction, handle revocation |
| `ACAP-SECURITY-v1` | Principals, grants, delegation limits, broker checks, trust zones |
| `ACAP-TRANSPORT-INPROC-v1` | Invocation semantics and equivalence requirements; trusted-code limitations |
| `ACAP-TRANSPORT-IPC-v1` | Framing, authentication, negotiation, flow control, disconnect/reconnect |
| `ALICA-PLUGIN-MANIFEST-v1` | Identity, entrypoints, provided/required capabilities, requested permissions, configuration |
| `ALICA-BUNDLE-v1` | Artifact inventory, paths, signatures, digests, SBOM/provenance and safe extraction |
| `ALICA-PROFILE-v1` | Composition, selections, overrides, resolution lock and separation from secrets/Cell identity |
| `ALICA-TRUST-POLICY-v1` | Bootstrap, accepted publishers, algorithms, rotation, revocation, expiry and immutable policy |
| `ALICA-SDK-CONFORMANCE-v1` | Public SDK obligations, test categories, fixtures and independent provider qualification |

Schema choice proposed: JSON Schema 2020-12, subject to ADR validation-library compatibility. Define UTF-8, duplicate-key policy, unknown-field policy, size/depth limits, integer range and canonicalization explicitly. Do not assume sorting JSON keys solves all cross-language digest issues.

## 10. Detailed Step-1 implementation plan

### Gate terminology

- **ENTRY:** prerequisites that must actually be satisfied before work proceeds.
- **DELIVERABLE:** version-controlled artifact or verified runtime result.
- **EXIT:** evidence needed to accept the gate; intent or scaffolding is insufficient.
- Gates below are proposed refinements of the supplied G0–G7 sequence. No gate is currently passed simply because it appears in this plan.

### Phase 0 — Approval and reference baseline (G0)

**Entry:** owner approval of this report's scope and assessment work; no runtime implementation.

**Steps**
1. Record scope, non-goals, decision authority and approval status.
2. Preserve the supplied plan and directive as reference documents with source provenance.
3. Pin V1 distribution commit and relevant artifact hashes; record retrieval dates and review limitations.
4. Complete the distribution-level component/authority inventory and list unresolved owner/source facts.
5. Decide whether additional concept documents exist; resolve contradictory normative claims explicitly.
6. Confirm protected V1 deployments/licensing evidence are not targets for this work.

**Deliverables:** reference index, assessment, scoped inventory, approval record, initial ADR register.

**Tests/checks:** retrieve pinned references; validate source hashes; check no V1 runtime import or application data is introduced.

**Exit G0:** owner accepts the Step-1 scope and the precise reference-review boundary; no unacknowledged missing input is treated as a settled requirement.

### Phase 1 — Normative design and threat model (G1)

**Depends on:** G0.

**Steps**
1. Resolve language/runtime, Kernel boundary and trust-zone ADRs.
2. Define capability ID, operation, version range, required/optional features and digest semantics.
3. Define PluginManifest, Bundle, Profile and resolution-lock schemas.
4. Define lifecycle states and legal transitions, including partial activation failure and dependency loss.
5. Define scope ownership, grant issuance/revocation, secret references and event visibility.
6. Define request deadlines, cancellation, idempotency metadata and normalized errors.
7. Define public transport interfaces and compatibility invariants before writing transport-specific code.
8. Document threat actors, trusted computing base, host assumptions and what in-process code can bypass.
9. Produce executable schema fixtures and conformance vectors; these are design validation, not a production Kernel.
10. Conduct the six requested reviews: identity/versioning, scopes/authority, lifecycle, grants/security, transport neutrality and offline independence.

**Deliverables:** approved minimum normative specification set, schemas, fixtures, ADRs, threat model and public dependency diagram.

**Tests:** malformed/unknown fields, duplicate keys, oversized structures, version conflicts, invalid grants, scope escape examples, digest vectors across independent implementations where practical.

**Exit G1:** public semantics are specific enough for a provider author to implement without Kernel internals; blocking security questions have decisions; owner accepts normative baseline. IPC details may be extended before G6, but must not contradict frozen core semantics.

### Phase 2 — Lean engineering foundation (G2)

**Depends on:** G1; owner-authorized host setup.

**Steps**
1. Finish owner-assisted host security inspection and document unresolved controls.
2. Install only the selected pinned runtime and necessary development tools; record versions and installation provenance.
3. Establish workspace, lockfile, public import boundaries and reproducible build commands.
4. Add format, type, unit, schema, dependency/license and secret checks.
5. Add CI with minimal permissions; record whether required checks are enforceable.
6. Add contribution, development setup, testing and security-reporting documentation.
7. Define release evidence format and signed-candidate design; do not implement a large release system yet.
8. Test a clean checkout outside the development working tree.

**Deliverables:** working minimal repository foundation, toolchain lock, CI/configuration, environment runbook.

**Tests:** clean build/test without V1 source, databases or services; no untracked local dependency; import-boundary violations fail; planted secret fixture is detected safely.

**Exit G2:** clean checkout builds/tests reproducibly with recorded commands and no V1 dependency. CI limitations are explicit blockers or owner-approved equivalent checks, never fictional green status.

### Phase 3 — Minimal trusted Kernel and synthetic Echo (G3)

**Depends on:** G2.

**Steps**
1. Implement local Cell bootstrap and validated configuration, with secrets kept separate.
2. Implement strict manifest parsing and minimal trusted-package verification before module evaluation.
3. Implement a scope tree with owner tokens and invalidation on destruction.
4. Implement registration storage indexed by scope, capability, version and owner.
5. Implement deterministic resolver and an explanation output: candidates, exclusions, tie-break and selected artifact.
6. Implement deny-by-default grant enforcement on resolution and invocation.
7. Implement lifecycle transitions and tracked disposers; activation must not expose partial registration state.
8. Implement minimal bounded event delivery and audit emission needed by the substrate.
9. Implement scoped secret-reference mediation with a synthetic local test secret only.
10. Implement in-process dispatch through the public ACAP boundary.
11. Add Echo A, independently implemented Echo B and a consumer unaware of provider implementation.
12. Add introspection for registry, scopes, grants and lifecycle without exposing secrets.

**Proposed lifecycle:** DISCOVERED → VERIFIED → RESOLVED → ACTIVATING → ACTIVE → QUIESCING → DISPOSED, with explicit FAILED states/cleanup. State names and transition rules are finalized at G1.

**Deliverables:** minimal runtime, two providers, one consumer, resolver explanation, audit/inspection output and lifecycle evidence.

**Tests:** substitution; shuffled registration order; missing/incompatible capability blocks ACTIVE; dependency cycles; partial activation rollback; double disposal; listener cleanup; child scope teardown; denied/expired/revoked grants; retained stale handles; secret denial; unload during calls.

**Exit G3:** both providers pass the same consumer suite; selection is deterministic; all Kernel-managed effects are reclaimed; scopes/grants are enforced; incompatible plugins never become ACTIVE. Uncooperative trusted in-process code limitations are documented rather than falsely sandboxed.

### Phase 4 — ACAP contract runtime and compiler tooling (G4)

**Depends on:** G3, with G1 contracts controlling behavior.

**Steps**
1. Complete descriptor validation and contract digest generation.
2. Implement operation input/output validation and capability/feature negotiation.
3. Define and normalize error codes and redacted diagnostic fields.
4. Implement absolute/effective deadlines, cancellation propagation and race handling.
5. Carry idempotency metadata without promising universal exactly-once execution.
6. Implement bounded event envelopes and streaming primitives required for IPC equivalence.
7. Implement `alicac capability init`, `validate`, `generate-client`, `generate-provider`.
8. Implement plugin, bundle and profile validation commands.
9. Implement `alicac conformance run` with machine-readable and human-readable results.
10. Test a provider in an isolated consumer project that cannot import Kernel internals.

**Deliverables:** public ACAP types/schema package, CLI, deterministic generated artifacts and conformance fixtures.

**Tests:** incompatible negotiation; optional/required feature behavior; invalid payloads; unknown operations; schema/digest mismatch; expired request; cancellation before/during/after completion; duplicate idempotency keys and provider-declared semantics; event overflow; generation determinism.

**Exit G4:** an independently authored provider passes the contract suite without Kernel internals. ACAP behavior is defined independently of JavaScript object identity and local exceptions.

### Phase 5 — Public SDK and external developer experience (G5)

**Depends on:** G4.

**Steps**
1. Implement `definePlugin`, `ctx.provide`, `ctx.require` and `ctx.optional` against public interfaces.
2. Provide scoped handles, owned effects, idempotent disposers and typed events.
3. Provide safe structured logging and scoped secret-reference access.
4. Provide mock context/testkit with documented differences from production enforcement.
5. Add deterministic failure injection for activation, revocation, timeout and cleanup.
6. Integrate generated provider/client interfaces with handwritten implementation examples.
7. Write a tutorial from an empty directory: define contract, build provider/consumer, test, package, verify and run.
8. Exercise that tutorial outside the monorepo and without private path aliases.
9. Define SDK compatibility and deprecation policy; freeze the supported public API surface.

**Deliverables:** usable public SDK, package exports, API docs, external tutorial and conformance report.

**Tests:** public-import-only build; missing optional capability; lifecycle cleanup; consumer/provider substitution; negative permissions; generated-code compilation; package contents exclude keys and internal source dependencies.

**Exit G5:** another developer can build, test and package a plugin using only documented public surfaces. 'Independent' means no internal imports and an independently written provider, not necessarily an additional employee.

### Phase 6 — Authenticated local IPC and transport equivalence (G6)

**Depends on:** G5 and approved IPC specification.

**Steps**
1. Choose local IPC framing, endpoint permissions and process identity binding in ADR.
2. Authenticate provider identity against the launched process/package; a caller-supplied provider name is not authentication.
3. Implement schema/version/feature handshake bound to accepted descriptor digests.
4. Serialize only ACAP values and preserve caller authority without trusting provider assertions.
5. Propagate deadlines, cancellations, errors, event metadata and stream backpressure.
6. Define maximum message sizes, queue bounds, heartbeat/failure detection and reconnect limits.
7. On disconnect, invalidate handles and fail outstanding calls deterministically; do not replay mutations automatically.
8. Run the same parameterized consumer suite over in-process and IPC transport with no consumer logic changes.
9. Add hostile subprocess tests with restricted filesystem/network access and no inherited secrets.
10. If containers are selected, package the same provider and prove equivalent behavior; do not introduce orchestration tooling without need.

**Deliverables:** authenticated IPC adapter, synthetic out-of-process provider, isolation documentation and equivalence report.

**Tests:** forged identity, wrong digest, replayed session, malformed framing, oversized payload, stalled stream, bounded queues, killed process, disconnect during call, grant revocation mid-stream, repeated reconnect, unload deadline and forced termination.

**Exit G6:** unchanged consumer logic passes both transports; authority never widens; bounded cleanup and failure behavior are demonstrated. Local IPC is the required second transport; container-specific support is a separate declared qualification if chosen, not a claim inferred from IPC.

### Phase 7 — Signed bundles, profiles and standalone Cell (G7)

**Depends on:** G6.

**Steps**
1. Finalize accepted profile and exact resolution lock with Kernel, SDK runtime as needed and synthetic providers only.
2. Produce immutable package/contract digests and signed manifests using approved signing custody.
3. Generate dependency-complete SBOMs or explicitly fail coverage criteria; generate truthful build/provenance statements.
4. Implement safe artifact extraction, path/symlink checks, atomic staging and verified activation.
5. Implement local Cell CLI plan/install/status/verify/stop and bounded upgrade/recovery commands as approved.
6. Include runtime dependencies and trust-verification material in a checksum-bound offline bundle.
7. Define trusted OS prerequisites and what is included for disconnected install; never silently fetch package-manager dependencies.
8. Separate immutable profile bytes from local Cell identity, secrets and operational state.
9. Implement no-op reinstall, failed-install recovery and last-known-good profile recovery.
10. Establish two clean acceptance hosts/environments independently of the dev workspace; one online, one disconnected at the declared boundary.
11. Verify accepted profile/lock digests match; capture network-denial evidence and unsuccessful outbound attempts where relevant.
12. Restore into a clean environment from a verified backup and separately supplied recovery material.

**Deliverables:** signed candidate, complete offline bundle, SBOM/provenance, profile lock, operator/install/offline/recovery guides, two-host evidence.

**Tests:** unsigned/tampered package, untrusted publisher, wrong contract digest, path traversal, missing artifact, stale/expired metadata, root substitution, prohibited trust-policy override, interrupted install, no-op reinstall, restart, upgrade failure/recovery and disconnected restore.

**Exit G7:** online and disconnected hosts accept identical immutable profile bytes, perform synthetic calls and recovery, and require no central ALICA runtime. Local identity/secret differences are expected and not disguised as profile differences.

### Phase 8 — Final qualification and handover (G8: Step-1 completion)

**Depends on:** G7 and all earlier gates.

**Steps**
1. Run the entire conformance, security, lifecycle, transport, packaging and recovery matrix against the exact release candidate.
2. Run approved performance and repeated-lifecycle stress workloads.
3. Confirm public imports and absence of V1/higher-service dependencies.
4. Review all known defects, limitations and SBOM/provenance coverage.
5. Run operator and developer documentation verbatim on clean environments.
6. Record artifact digests, source revision, toolchain, test results and reviewer disposition.
7. Mark each acceptance item PASS, FAIL or BLOCKED with evidence; never turn N/A into PASS.
8. Produce Step-1 completion report and request separate authorization for Step 2.

**Deliverables:** qualified substrate candidate, acceptance report, immutable evidence index, final docs, limitation register and next-step proposal.

**Exit G8:** all mandatory acceptance items pass, no unresolved P0/P1 defects, and owner accepts the handover. Completion does not authorize Hermes or service migration automatically.

## 11. Mandatory security and lifecycle test catalog

| Test ID | Scenario | Required result |
|---|---|---|
| SEC-01 | Unsigned/tampered plugin | Rejected before code execution |
| SEC-02 | Valid signature, untrusted publisher | Rejected |
| SEC-03 | Descriptor or package digest mismatch | Rejected before ACTIVE |
| SEC-04 | Undeclared secret access | Denied; value absent from logs/errors |
| SEC-05 | Child scope accesses parent/sibling authority improperly | Denied |
| SEC-06 | Operation not granted | Denied at invocation |
| SEC-07 | Expired/revoked grant or stale handle | Denied even after prior successful resolution |
| SEC-08 | Provider impersonation | Handshake rejected |
| SEC-09 | Cyclic/malicious dependency graph | Bounded deterministic failure |
| SEC-10 | Event outside visibility scope | No unauthorized delivery |
| SEC-11 | Profile overrides immutable trust policy | Rejected |
| SEC-12 | Malformed/oversized nested payload | Bounded resource use and normalized rejection |
| SEC-13 | Path traversal/symlink bundle attack | No write outside staging root |
| SEC-14 | Planted secret appears in diagnostics | Test fails; release blocked |
| LIFE-01 | Activation fails after partial registration | Effects rolled back; no ACTIVE state |
| LIFE-02 | Parent destroyed | Descendants, listeners and handles invalidated |
| LIFE-03 | Repeated disposal | Idempotent; no double release |
| LIFE-04 | Unload with calls outstanding | Quiesce/cancel/fail per contract; bounded wait |
| LIFE-05 | Hung or throwing disposer | Observable failure; remaining cleanup attempted; isolation limitations explicit |
| LIFE-06 | Provider lost/replaced | No silent unauthorized rebinding |
| IPC-01 | Disconnect during stream | Consumer notified; resources reclaimed |
| IPC-02 | Slow consumer | Bounded buffering/backpressure |
| IPC-03 | Retry/reconnect after mutation | No implicit duplicate replay |
| REC-01 | Corrupt backup / wrong key | Safe refusal without partial accepted state |
| REC-02 | Clean restore | Identity/trust/profile invariants verified |

Fuzz parsers, manifests, descriptor validation, IPC framing and lifecycle transition sequences. Retain reproducible seeds for failures; do not substitute fuzzing for deterministic negative tests.

## 12. Reliability and performance qualification

Numerical thresholds must be approved at G1/G2 after a small measurement baseline; none are claimed as measured in this report.

Measure:

- Cold boot to ready and activation time per plugin.
- In-process and IPC call latency distributions, including policy/schema checks.
- Stream throughput, buffering and cancellation propagation.
- Scope creation/destruction and event dispatch latency.
- Resolver scaling with provider catalog size and dependency graph density.
- Minimal-profile resident memory and growth across repeated activation/disposal.
- Provider failure detection, quiesce and forced-isolation termination time.
- Offline install duration, disk footprint and recovery duration.

Each benchmark record includes hardware, OS, runtime version, build mode, payload size, provider count, concurrency, warmup, sample count and raw results. Approve an absolute budget plus regression tolerance for each release-critical metric. Never improve benchmarks by disabling enforcement, signature checks or ownership tracking. Gate final completion on approved budgets, not arbitrary numbers introduced after results are known.

## 13. State, backup and recovery design

Step 1 has no production-domain data migration. Define a minimal state inventory:

| State | Expected treatment |
|---|---|
| Signed package/profile artifacts | Immutable and recoverable by digest |
| Operator trust roots/policy | Protected, backed up and independently verified |
| Cell identity | Persistent; explicit restore-versus-new-Cell semantics |
| Secret references | Configuration only; values separately protected |
| Secret values/recovery keys | Never in Git or default evidence; separate custody |
| Runtime registry/scopes/live calls | Reconstructed; not serialized as live object handles |
| Lifecycle journal if needed | Minimal durable record; atomicity and recovery specified |
| Audit records | Redacted, bounded retention and documented integrity guarantees |

Use atomic filesystem state where sufficient; adopt SQLite or another store only if requirements demonstrate a transactional need. Do not create a home-grown general database. A hash-linked audit log alone is not tamper-proof against a privileged host attacker; state the trust boundary.

Recovery acceptance must include a fresh environment, not just restarting the original process. Rollback must identify the last reversible state, accepted trust metadata, compatible state schema and forward-recovery path when downgrade is unsafe.

## 14. Documentation deliverables and ongoing workflow

For each phase, update documentation in the same change as behavior:

- Architecture and Kernel boundary.
- Normative ACAP specifications and machine-readable schemas.
- PluginManifest, Bundle, Profile and lockfile semantics.
- Lifecycle, scopes, grants and trust model.
- SDK public API and generated-code contract.
- Developer setup, examples and from-empty-directory tutorial.
- Operator installation, offline operation, updates and recovery.
- Test/conformance commands and expected result formats.
- ADRs, superseded decisions, known limitations and open questions.
- Version compatibility and dependency/license inventory.

Every document labels whether it is proposed, approved, implemented or independently verified. A plan is not a completed feature. Generated documentation must be checked for drift. Production credentials, access logs containing personal information and private deployment keys do not belong in documentation.

## 15. Acceptance criteria: when Step 1 is complete

All items below are mandatory unless a scope change is explicitly approved and version-controlled before qualification.

- [ ] Approved normative specification set and executable positive/negative examples.
- [ ] Clean checkout builds and tests without V1 source, databases or services.
- [ ] Standalone Cell boots from a verified accepted profile.
- [ ] Signed plugin acceptance and all mandatory rejection paths pass.
- [ ] Deterministic resolver explains selection and rejects missing/incompatible requirements.
- [ ] Two independently implemented synthetic providers satisfy one unchanged consumer.
- [ ] Scope ownership, visibility, destruction and handle revocation are enforced.
- [ ] Grants deny by default and reject unauthorized/expired/revoked operations.
- [ ] Scoped secret references work without leaking secret values.
- [ ] Typed events and streams have bounded, documented semantics.
- [ ] Lifecycle activation failure and teardown leave no Kernel-owned stale effects.
- [ ] Public SDK and generated provider/client work outside the monorepo.
- [ ] Independent provider passes ACAP conformance without Kernel internals.
- [ ] Same consumer suite passes in-process and authenticated IPC transports.
- [ ] Hostile IPC/disconnect/stream/cleanup tests pass.
- [ ] Trust bootstrap, expiry, rotation/revocation policy and immutable trust boundaries are tested.
- [ ] Package, contract and profile digests are verified; SBOM/provenance coverage is truthful.
- [ ] Online and disconnected clean hosts accept identical immutable profile/lock bytes.
- [ ] No central runtime dependency, implicit install downloads or higher-level ALICA services are required.
- [ ] No-op reinstall, interrupted install, restart and recovery are actually exercised.
- [ ] Clean-host restore validates identity/trust/state invariants.
- [ ] Approved resource/performance budgets pass without bypassing enforcement.
- [ ] Developer and operator guides are exercised from clean starting points.
- [ ] Security-relevant Kernel state is inspectable and audit output is redacted.
- [ ] No unresolved P0/P1 defects; lower-severity limitations have explicit dispositions.
- [ ] Exact source/artifact/evidence linkage is retained and owner accepts completion.

**Not sufficient:** a working Echo call alone, TypeScript interfaces alone, a successful unit-test run alone, a Docker image alone, or documentation saying the gates will pass later.

## 16. Milestones, dependencies and execution control

| Milestone | Outcome | Depends on | Approval/evidence |
|---|---|---|---|
| M0 | Initiation plan accepted | This report | Owner approval |
| M1 | Reference baseline and normative architecture | M0 | G0/G1 records |
| M2 | Reproducible engineering foundation | M1 | G2 clean-checkout evidence |
| M3 | Trusted Echo Kernel | M2 | G3 security/lifecycle evidence |
| M4 | ACAP toolchain and public SDK | M3 | G4/G5 independent provider/tutorial |
| M5 | Transport equivalence | M4 | G6 IPC evidence |
| M6 | Signed standalone online/offline Cell | M5 | G7 two-host/recovery evidence |
| M7 | Step-1 accepted | M6 | G8 completion report |

Do not assign calendar promises before the normative baseline and host/test resources are settled. Estimate work after G1; report actual progress per gate. Each work item should identify specification clause, owner, deliverable, test command, dependencies and rollback implications.

Parallel work is useful for documentation, schemas and independent conformance authoring once shared contracts are frozen. Do not parallelize competing Kernel implementations or allow multiple agents to independently change normative semantics without review.

## 17. Deferred roadmap — not authorization

After Step 1 is accepted:

1. **Step 2:** separately plan Hermes harness integration through generic versioned capabilities; keep framework internals out of Kernel.
2. **Step 3:** separately plan MemoryV4, Doghouse, UniUI, Unify, AInbA and other services as replaceable plugins/adapters.
3. For each later domain, identify one authoritative writer, backup, migration contract, rollback trigger and tested recovery.
4. Preserve V1 while adapters/shadow behavior are validated; never copy the entire Cell indiscriminately.
5. Retire V1 only after explicit domain cutover and independent recovery acceptance.

The original document's migration waves are reference options. They do not override the owner's Step-2/Step-3 boundaries or authorize work now.

## 18. Owner approval request and immediate next actions

Please approve or amend:

1. The strict substrate-only scope and completion criteria.
2. TypeScript/Node with language-neutral JSON contracts as the proposed implementation direction.
3. Trusted in-process plugins plus authenticated isolated local IPC as the first two execution modes.
4. No automatic adoption of Cordis, Docker, databases, identity servers or application services.
5. The staged G0–G8 plan and explicit normative approval gate.
6. Initial Ubuntu amd64 qualification proposal; exact support claims follow testing.
7. License choice, repository protections and CI policy.
8. Provision of two clean acceptance hosts and owner-assisted privileged inspection when needed.

**After approval:** close blocking ADRs and missing source inputs, freeze normative contracts, then provision the selected minimal toolchain. Production Kernel implementation follows G1/G2, not before.

**Until approval:** only assessment, source review, repository documentation and agreed access preparation are authorized. No Kernel, ACAP runtime, SDK implementation or service integration has been started.

## 19. Source index and verification notes

### User-provided sources

- `ALICA_V2_Kernel_ACAP_SDK_Step1_Building_Plan.md` received in this conversation.
- Complete ALICA V2 Initial Project Directive received in this conversation.
- Dedicated VPS and deploy-key authorization supplied by owner.

### V1 references — fixed source commit

Base: https://github.com/BartSchuster22/Alica-DSH/tree/d3feafa9c03a0175ae3d702413f97e0e8f1634c9

- `README.md`
- `docs/OPERATOR.md`
- `docs/DATA-PRIVACY.md`
- `docs/D6-INDEPENDENT-ACCEPTANCE.md`
- `SECURITY.md`, `SUPPORT.md`
- `release/d6-candidate/manifest.json`
- `release/d6-candidate/acceptance-matrix.json`
- `release/d6-independent-acceptance.json`
- `release/d6-candidate/publication-source-map.json`
- `.github/workflows/d6-independent-acceptance.yml`
- `scripts/build-d6-candidate.py`
- `scripts/build-d6-offline-bundle.sh`
- `scripts/d6-independent-operator-acceptance.sh`

The initial guessed workflow path returned 404; the repository tree was then inspected and the correct `d6-independent-acceptance.yml` file was reviewed. The binary `alicactl` could not be decoded as source; this is a review limitation, not evidence of a broken CLI.

### Inspirational references

- https://github.com/deepseek-ai/deepseek-harness
- https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md

### Live verification

- SSH host-key verification and successful non-root login.
- OS, CPU, RAM, disk, tools, sockets and running systemd services inspected.
- Git/Python versions and UTC/NTP status inspected.
- Noninteractive sudo unavailable.
- GitHub repository refs and clone verified on the dedicated VPS.

**Evidence boundary:** actual command results substantiate the host/repository facts above. Future gate outcomes, performance numbers, production security guarantees and successful online/offline acceptance are not claimed by this report.
