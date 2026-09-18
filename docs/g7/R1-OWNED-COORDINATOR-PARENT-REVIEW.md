# Owned coordinator and IPC fixture — independent parent review

Published baseline: 122ac0d33cb0a1e08aef836ac7c964ae365a30b3. This review qualifies a bounded stopped read-only verification component, NOT G7 acceptance, independent-process reinstall, upgrade or custody-fence retirement.

## Independent execution

The original parent full check failed in existing G6 IPC qualification (159/160): UNAVAILABLE versus PERMISSION_DENIED. That run never reached G7. Its original raw log is preserved separately, not superseded by a later pass.

After the fixture correction, the independent unchanged npm run check exited 0: Node 170/170, 162/162, 272/272; Python 193, 30, 11, 9 nested process cases and 121, all passed. All thirteen captured source/doc hashes match before execution, after execution and the returned local files. Separate parent logs and bindings are under evidence/g7/owned-parent. Parent also independently verified all 139 IPC diagnostic evidence hashes and all 7,725 original coordinator manifest entries; original coordinator bytes remained unchanged.

## Review findings

Reviewed the owned coordinator, stopped inspector, supervisor hooks and IPC fixture/regression changes. The coordinator retains the same lock description from inception, authenticates actual forked-child messages, seals admission, proves exact owner and custodian normal reaps and only then runs read-only maintenance. Detached supervisor hooks are inert. The stopped inspector binds original accepted release, operator authorization and current trust without minting a restart/reinstall permit. Successful completion deliberately retains the durable custody fence. It does not prove opaque Kernel continuity or authorize mutating maintenance.

The fixture correction reuses a settled downstream binding rather than creating an unanswered binding mutation inside an expiring invocation. Unanswered mutation remains fail-closed in production. Consumer assertions and setup budgets remain unchanged; two real-process deadline regression cases and explicit unanswered-binding coverage were added. No production IPC change, weakened import boundary, relaxed expected error, skipped test or raised deadline was accepted. Controlled experiments reproduced both observed error signatures, but the uninstrumented historical failure cannot prove an exclusive cause or exact assertion phase. That limitation remains part of the review.

Worker original failures, corrections, source bindings and detailed coverage limitations remain authoritative in R1-OWNED-COORDINATOR-EXECUTION.md and R1-IPC-PARENT-REGRESSION-CHECKPOINT.md. Their uncommitted/pending language describes worker handoff, not a replacement for this independent review.

## Remaining work

Continue authenticated independent-process exact reinstall with opaque Kernel continuity, safe mutating lifecycle/upgrade/reconciliation, assembly/SBOM, encrypted backup/restore and independent online/disconnected qualification. A stopped fence cannot be retired or adopted merely because cached state says STOPPED. Distinct-UID coverage and owner-controlled signing/final acceptance remain outstanding. No production signing/deployment, RAM/swap/service changes or G7 acceptance occurred.
