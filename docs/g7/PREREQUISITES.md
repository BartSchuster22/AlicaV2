# G7 entry prerequisites and owner decisions

Status: G7 implementation and scoped existing-host environment setup authorized. Both OS-level environment probes passed; production signing custody, contract freeze and runtime/candidate qualification remain open. No production keys or G7 release have been created.
Baseline: `79702d16d41153ea3ad4518be7b04eb8a45b43c1`.

| ID  | Requirement                                   | Current evidence/status                                                                                     | Closure / owner                                                                                                                                                                                   |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E01 | Formal G6 acceptance | CLOSED for `79702d1`: clean checks, authenticated foundation CI success and owner “Accept G6” | [Acceptance record](../gates/G6-OWNER-ACCEPTANCE.md); no waiver needed |
| E02 | Implementation authorization for G7           | GIVEN: owner requested implementation/completion of the listed G7 phase; design/contract and custody decisions remain explicit                                                       | Owner approves reviewed design and actual implementation scope                                                                                                                                    |
| E03 | Trusted bootstrap and signing custody         | OPEN; no production key fingerprints or custody approved here                                               | Owner chooses custodian, trusted verifier delivery, root/publisher roles and recovery route; secrets never in chat/repo                                                                           |
| E04 | Journal/restore contracts and limits          | OPEN per ADR-009                                                                                            | Review closed schemas, atomicity/crash rules, archive/resource limits and encrypted backup format/dependencies before packaging code                                                              |
| E05 | Two independent clean acceptance environments | ASSIGNED: Alicav1 online and DSH2 disconnected; isolated OS probes passed, actual G6/G7 runtime and restore qualification pending                                                                                                | Owner nominates disposable online and disconnected hosts/VMs, access, platform and resource/cost approval; separate filesystems/identities, no dev checkout/dependency cache/runtime output reuse |
| E06 | Offline boundary and network control          | Prepared-OS test boundary exercised: DSH2 IPv4/IPv6 attempts failed ENETUNREACH; host management networking unchanged                                                                               | Approve exact OS prerequisites and safe network isolation with management/recovery access; demonstrate blocked application egress, not merely absent DNS                                          |
| E07 | Runtime/bundle inventory and licensing        | OPEN                                                                                                        | Enumerate full shipped runtime/native/JS dependencies, OS boundary and license notices; private development authorization is not a public distribution license                                    |
| E08 | Policy/profile/lock and artifact mapping      | OPEN                                                                                                        | Review exact selected synthetic providers, grants, deterministic lock policy digest, fixed metadata paths and existing-schema artifact-kind mapping                                               |
| E09 | Release evidence/CI process | Existing G2 manual control retained; GitHub read access verified and G6 CI confirmed | G7 still needs its own exact-candidate evidence and owner acceptance; G6 CI is not G7 qualification |

## Approved host allocation and observed OS probes

Owner approved reuse of Alicav1 (ALICA-v1, 167.233.135.142) and DSH2
(95.216.216.143), using dedicated isolated OS images rather than purchasing VMs.
Alicav1 is online; DSH2 is disconnected inside its test network namespace. Both
OS-level probes passed. These are not yet candidate acceptance environments
qualified for G6 native workers, signed installation or restore.

The hosts contribute different OS/kernel baselines: Ubuntu 24.04/kernel 6.8 and
Ubuntu 26.04/kernel 7.0 respectively. Landlock ABI probes returned 4 and 8.
Do not claim identical OS images or silently extend G6 compatibility. The future
application profile bytes, not OS image hashes or local identities, must match.
See [environment evidence and limitations](ENVIRONMENT-PROBES.md).

Online host O and disconnected host D install the same immutable candidate.
Transfer archives and trust material through an approved channel before D's
application-network boundary is disabled. Maintain a separately declared management
console/control plane; never cut the owner's only SSH route. Capture guest/network
policy and observed denied outbound attempts without exporting credentials.
A fresh reset/restore environment must not inherit build caches or accepted Cell
state. Its bootstrap/OS provisioning record is separate from application install.

Only the explicitly approved new G7 environment paths on Alicav1 and DSH2 are
authorized. Existing deployments, licensing artifacts, archives and recovery
material remain protected. ElioHermes is not a test target. No host-global
firewall/security relaxation, existing-volume cleanup or new purchase is implied.

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

Product implementation/qualification steps remain outstanding. OS-only setup and
probe success are not claims that Cell tooling, signed bundles or restore work.
