# Blocking final-review remediation

Original independent BLOCKED review is retained verbatim in FINAL-REVIEW-BLOCKED.json. Only its three blockers are addressed; frozen descriptor, catalog admission and accepted originals unchanged.

K15: each REST transport dispatch now reacquires the public secret and revalidates exact caller mapping after the asynchronous secret call, immediately before dispatch; update/comment cannot reuse authority across their preflight GET. Four real proxy-held GET cases separately revoke mapping/secret for update/comment, assert PERMISSION_DENIED and zero mutation requests without disposal, and reconcile the original task through another authorized client.

K16: normalize create/update title using the pinned Python str.strip whitespace set, reject empty normalized titles before write, compare normalized response. A content/state mismatch after possible creation is UNKNOWN with empty task, not a definite no-write CONFLICT; authoritative explicit HTTP conflict remains a provider error. Existing collision test now asserts uncertainty and reconciles original content. Real padded-title fresh/replay/update/read and whitespace-only cases pass.

K14: text bounds use Unicode code points as frozen JSON Schema requires, not UTF-16 units. Real256-emoji create title +8000-emoji body,129-emoji update, get/list and257 rejection pass. Independent byte bounds unchanged.

Executed current actual-catalog25/25 in conformance-attempt10.log, no skips/fails; real backend restart;16 triage/unassigned/no-run proof tasks. Historic admission remains based on original19-case execution; archived preadmission source files retain every admission hash. verify-release maps those historic hashes explicitly rather than pretending old evidence describes changed source. SOURCE-SHA256.json identifies current qualified files. No production adoption or Owner Acceptance.
