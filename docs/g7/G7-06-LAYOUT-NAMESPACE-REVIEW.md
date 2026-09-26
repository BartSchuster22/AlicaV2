SOURCE_READY — G7-06/WP6 output file/descendant namespace fix only.
No actionable source defect found. Parent selective publication is next; G7 incomplete.

Compared exact git-show layout at published 3470d8ebb59e49e6817e2d0266a529ab7bc59c11:
SHA256 9bd5a3bc3b7335e741642ba9426cd8194646a2c1c46bcedd212e2a7a82eb02ed.
It equals retained baseline; existing regression also matches publication. Ingress
is CLOSED, not reviewed. SOURCE-SHA256.json fully verified; runtime-layout.patch
is exactly the baseline-to-candidate unified diff.

Independent real serial reruns, evidence review/{before,after,existing,narrow}.{json,log}:
original exit1 Missing expected exception, pkg/item | pkg/item/child.js;
repaired exit0 12 cases; unchanged regression exit0 9/9; narrow exit0 10 probes.
Before/after use identical test bytes. Narrow probe covers mixed-case ancestors,
package-root file collision, reverse safe siblings and immediate successful call
after rejection with input/extra metadata preserved. No general validator added.

Both orders reject: prior file appears among component parents; prior descendant
has already registered its containing directory. Lowercasing matches prior alias
policy. Slash-delimited parents avoid item-more/item.js sibling false positives;
shared directories stay legal. Local sets prevent cross-call state leakage.
Original grammar, closed auxiliary mapping, ordering, source/bytes/hash/extra
metadata and input immutability remain unchanged. At valid depth <=16, added
parent storage is O(entries*depth); parent construction O(depth squared) per entry.
No inventory cap or actual materialization/race guarantee is introduced or claimed.

Security screen: reviewed complete changed source/test and this doc; synthetic
metadata only, no secrets/credentials/private keys or dependency/license additions.
Pure function + Node assert/node:test only; no child/network in executed closure.
Existing Node reused read-only, no install/copy. Serial direct processes enforced
30+5wall20CPU2GiB64FD64KiBfilecore0; NOT aggregate-tree containment certification.
Free-space and enclosing caps checked; final sizes/counts in review/publication-set.json.
980MiB reservation and original192MiB breach retained; no release/refund.

Exact minimal publication set (remote slice-relative source -> repo destination):
tools/g7-runtime-layout.mjs -> same
SHA256 c9490a2363f7338aa51fc165b5893f812fe279711a9b668949a5dd6e3210dfab
tests/g7/runtime-layout-namespace.test.mjs -> same
SHA256 a0086f9a393f968430d6ef755d02591a746df3fab03c50ae57f99293806f792a
INDEPENDENT-REVIEW.md -> docs/g7/G7-06-LAYOUT-NAMESPACE-REVIEW.md
Exact doc hash/path and all three files: review/publication-set.json (avoids self-hash).
No unchanged regression/baseline/ingress files need publication. Raw evidence stays DEV.
No implementation edits, deployment/auth checkpoint/runtime action, actual Cell,
Kernel/native/assembler/bootstrap/signing/keygen/services or protected data access.
Not physical-filesystem/race/full-WP6 qualification, publication or owner acceptance.
