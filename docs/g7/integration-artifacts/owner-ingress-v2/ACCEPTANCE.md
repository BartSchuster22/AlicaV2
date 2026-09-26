# Isolated owner ingress v2 — SOURCE candidate, not deployment qualification

Scope: ONLY /home/alica-dev/g7-owner-ingress-v2. No source checkout, live
Hermes, account, credential, service, network configuration, ref/index or
protected original changed. No real checkpoint or owner confirmation acquired.
No token/configsecret dumps, polling, sends, restart, signing or key generation.

## Exact integration / cross-project review
telegram.patch is an exact unified patch against the installed source hash in
TELEGRAM-BASELINE.json. It adds one import and invokes ingest_raw_confirmation
on the genuine Update in _handle_text_message BEFORE effective-message fallback,
cleaning, attribution and batching. tests/raw-handler.py is only that exact
proposed method fragment, not a copied Hermes tree. Handler registration is TEXT
and not COMMAND. It does not treat MessageEvent, LLM output or history as authority.
New Python modules reside in gateway/platforms/. Live Hermes remains unchanged.

cell-rotation.patch changes the existing lexical readOwnerCheckpointConfirmation
from unavailable to a query of the protected ingress map keyed by exact CellID
and raw-byte SHA256. It preserves the seven-field internal snapshot and origin
binding checks. tools/g7-cell.mjs and tools/g7-durable.mjs are exact published
read-only test inputs, NOT modified deployment candidates. No public Cell approval
argument/setter, executor, timing/admission/backup policy or durable store added.
Only historicalPinProvenance can advance. Schema, exact-byte hashing, custody,
rechecks, prior-release, floors, lineage/latest inspect, old-reader rejection and
all action flags remain unchanged. New Node modules must accompany the helper;
parent must review packaging/tool inventory and private publication separately.
No packaging manifest or production artifact has been changed/qualified here.

## Trust and protocol
Gateway requires explicit separately pinned numeric owner sender and private chat.
There are NO account/chat defaults and no use of 1371039817. Require actual
message.from_user (non-bot), original Update.message, private chat, exact text;
reject absent sender, edits, forwards, channel/business/callback substitutes,
sender_chat, via_bot and attribution substitutions. Private chat ID is never a
sender fallback. Owner rule remains per-checkpoint explicit confirmation HERE.
The exact deliberately non-LLM syntax is:

explicit owner confirmation
CellID=<exactCellID>
SHA256=sha256:<64 lowercase exact-byte hex>
purpose=historical rotation pins only
genesis/latest/expected independently established

This final line is the owner's explicit independent-anchor attestation for that
checkpoint, NOT derivation from candidate history. No anchor is fetched/inferred
from a request; no real attestation exists. This does not independently inspect
an anchor establishment ceremony or certify correctness of owner's inputs.
Projection removes only this independently-established attestation line into the
existing independentAnchors field; exact CellID/digest/purpose remain bound.
Transport: one 4-byte big-endian length and <=2048 ASCII bytes, EOF commits only
one exact frame. No JSON identity, trailing frame, partial frame or normalization.
64 immutable records maximum; duplicates idempotent, no eviction or durable store.
Lookup returns a frozen primitive snapshot; freeze is NOT authentication.
Two-second socket/handshake bounds, one receiver connection and one in-flight
gateway delivery. Failures do not acknowledge approval. Gateway consumes valid
confirmation text; its boolean is consumption only, not delivery or durability.
Restart loses all volatile records. No retention/revocation/control-path durability
claim. Default CONFIG=None / export default null gives UNAVAILABLE.

## Authentication and deployment prerequisites — STILL REAL GAPS
The source receiver derives identity from an authorized, non-resumed Node
TLSSocket's peer certificate bytes, compared to a trusted SHA256 certificate pin.
NOT payload identity. CA validation, requestCert/rejectUnauthorized are forced.
Gateway similarly CA/hostname-verifies and pins the receiver before sending.
Existing separately provisioned TLS credentials are a prerequisite, not created.
Source createOwnerCheckpointReceiver constructs the actual secureConnection
handler/server but never binds/listens here. No live service/socket was needed.

A future separately authorized deployment must establish THREE independent OS
identities: raw-only gateway, trusted receiver/Cell control plane, candidate.
UID config must name distinct identities; each side checks its actual own UID.
Remote peer identity is TLS, not a self-reported UID; config UID declarations do
not prove remote OS custody. Installed SSH keys/shared-UID supervisor IPC prove
no Telegram origin and are NOT used as ingress authentication.

Protect code/import paths, parent directories, pin/config inputs, TLS keys, bot
credential, memory/map and receiver endpoints from candidate writes/reads/ptrace,
FD inheritance or candidate execution. Ordinary tool-running Hermes under the
same UID is NOT this deployment. Raw gateway must not host LLM/candidate code or
expose this function as an agent tool. Candidate processes cannot possess the
TLS identity. Receiver/Cell process also cannot evaluate hostile candidate JS.
Provision gateway's actual authenticated Telegram transport (verified PTB bot
updates, protected bot credential and webhook authentication if used). Fake raw
Python objects are acceptable ONLY in tests, never as external ingress. No
attacker-writable config/env/history/plugin can select pins or supply transport.
Deployment must independently demonstrate these controls, pinned accounts/chat,
CA/certificate ownership and end-to-end real message routing before production
configuration. Source UID checks and certificate APIs do NOT establish them.

## Tests and source acceptance
Tests serial, installed Node/Python only. Python tests execute exact proposed
raw handler, actual encode/ingest/_send with TLS/socket mocks and output only a
synthetic frame. Node consumes that frame, exercises actual receiver and private
lookup/origin adapter with explicitly injected transport identity. It also tests
real production fake-socket rejection and server-construction options via mock.
No live socket, TLS handshake, OS separation, real Telegram or actual checkpoint.
Original Cell preflight fragments execute with prior established API mocks and
actual unconfigured ingress dependency; no native Cell/Kernel/assembler/bootstrap.
Tests never import/spawn child_process/subprocess, create real network endpoints,
or generate/sign keys. TLS connect/createServer are mocked before any invocation.
Runner/admin SSH/setup are not test children. Limits are per process:
30+5wall/20CPU/2GiB/64FD/64KiBfiles/core0; direct child CPU measured. No aggregate
process-tree or syscall sandbox claim. Root accounting includes dirs/root/logs.

Parent independent review required before publication or any cross-project edit.
Source acceptance is not deployment acceptance, not G7 completion. Remaining
human gate after source: actual checkpoint-specific OWNER confirmation HERE of
exact CellID/byteSHA256/purpose plus independent genesis/latest/expected. NONE
has been authorized. No same-permission request or invented approval is needed.
