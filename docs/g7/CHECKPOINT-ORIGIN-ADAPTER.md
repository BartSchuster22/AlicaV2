# Owner-confirmed checkpoint origin — source candidate

Approved rule, NOT approval of any checkpoint. No production confirmation has been
provided, stored, provisioned or recovered. G7 remains incomplete.

The minimum adapter uses the already-packaged tools/g7-cell-rotation.mjs;
tools/g7-cell.mjs invokes it from actual ownedInspectRotationRecovery(path).
No public approval parameter, setter, token, service, wire protocol, signing system,
authority-by-UID or packaging dependency is added. The Cell method retains one
argument. Extra request arguments confer nothing. Ordinary callers can invoke the
pure inspector but cannot populate its lexical confirmation lookup.

## Trusted boundary and default
readOwnerCheckpointConfirmation() is a private read-only control-plane lookup.
Production unconditionally returns undefined. NO authenticated production ingress,
owner-account mapping or chat binding is configured. Production cannot currently
report origin ESTABLISHED. No request, candidate, checkpoint file, environment,
history, mode, pathname, JSON claim, boolean, display name or locally minted token
is accepted as owner authority. Source/in-process integrity remains a deployment
prerequisite: this is not a sandbox against hostile in-process JS, proxies or
source replacement, nor a novel same-UID authority model.

Only a separately established authenticated operator/control-plane bridge may
implement that lookup. It must authenticate the named OWNER (not display name),
bind the designated Telegram chat, and verify explicit confirmation in that chat
of EACH CellID, exact-byte SHA256 and purpose "historical rotation pins only".
Genesis/latest/expected must be independently established, not inferred from the
submitted history/request. Approval of this rule/adapter is not a confirmation.

The bridge must supply a verified ordinary data snapshot, NEVER pass through a
user approval payload as verified. Logical labels 'owner' and
'designated-owner-telegram-chat' do NOT authenticate an account or select a real
chat. Actual authenticated account/chat and exact-message evidence verification
remain prerequisites. Undefined lookup preserves existing legacy read-only
assessment with origin UNAVAILABLE. Invalid records throw
CHECKPOINT_ORIGIN_MISMATCH (Cell DENIED); ingress exceptions also deny.

Verified snapshot has seven closed string fields: authority, channel, cellId,
checkpointDigest (sha256: + 64 lowercase hex), purpose, independentAnchors,
confirmationEvidence. independentAnchors must attest
'genesis/latest/expected independently established'. confirmationEvidence must
agree with the exact binding, projected AFTER authenticated ingress verification:
  explicit owner confirmation\nCellID=<cellId>\nSHA256=<checkpointDigest>\npurpose=historical rotation pins only
Here \n means a newline. This is internal evidence projection, NOT a new user
approval syntax or authentication mechanism. The bridge must verify the actual
message agrees, not manufacture the projection from checkpoint bytes or infer it
from standing approval. Matching text outside the trusted boundary confers no
authority. No production approval retention is introduced; records are synthetic
tests only. No bridge implementation or new transport is provided in this slice.

## Ordering and preserved gates
Under existing custody/read bounds, Cell reads checkpoint bytes and its identity,
charges one control lookup, hashes the untrimmed Buffer, compares trusted binding,
rechecks custody, THEN parses the checkpoint. Checkpoint CellID additionally must
match Cell identity. No canonicalization or trimming precedes the hash. Existing
identity/checkpoint/history byte and inventory rereads remain. Changed bytes or
lost custody deny. Only a primitive origin status survives; mutable approval
aliases cannot change it. A later invocation rechecks the record. This snapshot
is not a live revocation, concurrency, durability or custody certificate.

Only historicalPinProvenance may advance to ESTABLISHED. Every predecessor still
requires historical crypto; latest inspectPersistedTrust is unchanged. Lineage,
bounds, prior-release and floor validation remain. Overall status stays
UNAVAILABLE/NEEDS_OPERATOR; authenticatedHistory/executionAuthorized/updateTrust/
activationReplay all stay false. Eligibility, replacement authorization,
durability and numeric fit are separate gates. No funding, recovery, provisioning,
signing or execution permission is implied.

## Tests and next acceptance
Portable tests use actual Cell methods plus the real isolated public-fixture
historical verifier. FS/custody/latest inspection are explicit existing mocks.
Only the isolated VM helper lookup is replaced by TEST-only confirmation data;
this is neither a production API nor operator proof. Unmodified production helper
caller-claim negatives and original one-arg preflight tests also run. No production
Cell/Kernel index/native/assembler module is evaluated; keygen/signing zero.

Next: independent parent source review/publication. Production origin acceptance
additionally requires a separately established and reviewed authenticated bridge
AND actual per-checkpoint explicit owner confirmation. Neither exists here. Do
not invent either or reopen the settled rule. No real checkpoint is authorized.
