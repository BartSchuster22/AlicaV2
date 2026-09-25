# Backup/restore transport recovery checkpoint

Source-reviewed WIP. Two existing product modules and their standalone qualification sources recovered unchanged from the retained working sources. No Cell, bridge, coordinator, native, NULL, crypto binary, key material or runtime assembly changes. No new dependencies.

Independent parent review read the complete four-file patch; exact hashes/application/whitespace and unchanged direct source dependencies verified. Real mixed worktree/index and HEAD preserved. Modules depend on built contracts, existing archive/durable interfaces and a pinned age executable; source inclusion is not executable admission. Standalone qualification scripts are outside the usual *.test.mjs glob and execute keygen/crypto when separately authorized. Neither ran in this pass.

Historical backup evidence: evidence/g7/stopped-backup/current-manifest.json binds these exact backup/test and archive/durable sources; recorded local transport exit0 is retained only in that historical environment and scope. Historical restore dev-return-Holaf6 source.after-transport matches the test but NOT this restore implementation. No restore PASS transferred. No fresh composition/runtime qualification.

Transport does not grant Cell authority, source custody or native containment. Backup produces backup.age; restore produces authenticated validated quarantine, not an accepted/running Cell. Caller callbacks must be trusted and synchronous. FD-held executable pinning does not freeze inode contents against a hostile same-UID writer.

Private partials, including plaintext, can remain on failure. Publication errors do not promise rollback. Timer/child-close source logic is not an externally enforced cleanup bound. Stdout error handling and additional failure-path coverage remain review/qualification gaps; no universal robustness claim. Original large product transport limits are not permission under the smaller G7 execution budget.

Full restore producer/custody integration, native evidence and end-to-end qualification remain open. Selected sources contain no literal secrets or vendored implementation on manual review; external dependency notices/licensing and final release gates remain separate.
