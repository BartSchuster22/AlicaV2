# G7 entry prerequisites and owner decisions

Status: preparation only. No host, key or release changes authorized/performed.
Baseline: `79702d16d41153ea3ad4518be7b04eb8a45b43c1`.

| ID  | Requirement                                   | Current evidence/status                                                                                     | Closure / owner                                                                                                                                                                                   |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E01 | Formal G6 acceptance | CLOSED for `79702d1`: clean checks, authenticated foundation CI success and owner “Accept G6” | [Acceptance record](../gates/G6-OWNER-ACCEPTANCE.md); no waiver needed |
| E02 | Implementation authorization for G7           | NOT GIVEN; owner authorized design/prerequisites only                                                       | Owner approves reviewed design and actual implementation scope                                                                                                                                    |
| E03 | Trusted bootstrap and signing custody         | OPEN; no production key fingerprints or custody approved here                                               | Owner chooses custodian, trusted verifier delivery, root/publisher roles and recovery route; secrets never in chat/repo                                                                           |
| E04 | Journal/restore contracts and limits          | OPEN per ADR-009                                                                                            | Review closed schemas, atomicity/crash rules, archive/resource limits and encrypted backup format/dependencies before packaging code                                                              |
| E05 | Two independent clean acceptance environments | NOT ASSIGNED                                                                                                | Owner nominates disposable online and disconnected hosts/VMs, access, platform and resource/cost approval; separate filesystems/identities, no dev checkout/dependency cache/runtime output reuse |
| E06 | Offline boundary and network control          | PROPOSED prepared-OS boundary                                                                               | Approve exact OS prerequisites and safe network isolation with management/recovery access; demonstrate blocked application egress, not merely absent DNS                                          |
| E07 | Runtime/bundle inventory and licensing        | OPEN                                                                                                        | Enumerate full shipped runtime/native/JS dependencies, OS boundary and license notices; private development authorization is not a public distribution license                                    |
| E08 | Policy/profile/lock and artifact mapping      | OPEN                                                                                                        | Review exact selected synthetic providers, grants, deterministic lock policy digest, fixed metadata paths and existing-schema artifact-kind mapping                                               |
| E09 | Release evidence/CI process | Existing G2 manual control retained; GitHub read access verified and G6 CI confirmed | G7 still needs its own exact-candidate evidence and owner acceptance; G6 CI is not G7 qualification |

## Host proposal, not allocation

Two disposable Ubuntu 24.04 x86_64 VMs are the proposed acceptance units. Whether
they share a hypervisor must be disclosed; this is not a claim of independent
physical hardware. Confirm the arrangement against the phase-plan independence
requirement before qualification. Containers on the development workspace alone
are not substituted for two clean acceptance systems.

Online host O and disconnected host D install the same immutable candidate.
Transfer archives and trust material through an approved channel before D's
application-network boundary is disabled. Maintain a separately declared management
console/control plane; never cut the owner's only SSH route. Capture guest/network
policy and observed denied outbound attempts without exporting credentials.
A fresh reset/restore environment must not inherit build caches or accepted Cell
state. Its bootstrap/OS provisioning record is separate from application install.

Existing development and production machines are NOT designated acceptance hosts.
Do not provision on ElioHermes, DSH/DSH2, V1 deployments or protected licensing
storage. No firewall/privileged changes or purchases are implicit in this plan.

## Proposed implementation order after entry clearance

1. Review/freeze concrete packaging, journal and recovery formats and limits.
2. Implement bounded verifier/extraction and deterministic profile/lock tooling.
3. Implement Cell lifecycle transaction/reconciliation and structured CLI.
4. Implement approved signing, inventory/SBOM/provenance and offline assembly.
5. Implement backup/recovery with approved key custody and current trust checks.
6. Run adversarial/component tests, then full regression and two-environment
   online/offline/restore acceptance against a single immutable candidate.
7. Publish evidence and request G7 acceptance; do not start G8 or service migration
   merely because scripts execute successfully.

All steps remain future work. This list is not a claim of implemented tooling.
