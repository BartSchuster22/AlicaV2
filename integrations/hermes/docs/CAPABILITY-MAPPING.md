# Phase3 capability mapping

Original H5 mapping; implementation-neutral contract, deliberately finite provider domain.

## Contract and selection

Catalog identity: `acap://alica.io/agent/execution@1`, EXPERIMENTAL, not STABLE.
Runtime ACAP descriptor: `io.alica.agent.execution`, version `1.0.0`, no features.
The governed definition, descriptor, review, admission and snapshot are in
`catalog/proposals/agent-execution/`. The snapshot digest is
`sha256:98aa324f38e7a25cbdaeb62174ad0644c1ca0dbbf2964a0f60390cbd76c43559`.
These Catalog and runtime identifiers are distinct, not interchangeable strings.

`execute` is unary, idempotency `none`. Input is exactly `{task: string}`,
1–4096 characters; output exactly `{text: string}`, 1–8192 characters.
Additional fields are forbidden. There is no public model, credential, process,
profile, workspace, tool-selection, resume or session API.

The common supported task is `Read the approved fixture and return its text exactly.`
The required result is `ALICA request-scoped fixture`. The neutral reference
returns its immutable fixture. Hermes reads the equal fixture through its native
`phase3_fixture_read` tool and actual AIAgent loop. Offline reproduction replaces
only model traffic with explicit MOCK events; it is not new real-model evidence.
The identical SDK consumer imports no Kernel or Hermes implementation.

## Authority and state

The public Host authorizes `execute` in the consumer's scope before required
capability activation. Provider-internal request/reply/cancel events have explicit
grants. Bridge checks bind source instance, scope, generation and principal;
sequence and request-ID correlation reject foreign/replayed work. Discovery alone
does not confer execution authority. Caller task text cannot select trusted
operator configuration. One request runs at a time; overlap is RESOURCE_EXHAUSTED.

The verified VM owns capability registration. The trusted external operator owns
the SDK event/effect bridge and process runner. The request child owns a fresh
home/workspace, native registry and client. Host shutdown disposes registrations,
listeners, pending calls and effects; the operator closes the runner and removes
its request root. Original live durable ledger/attempts/reports are NOT disposable
request state and must be retained. No retry, deduplication or persistent session
is promised; repeating an uncertain request is unsafe.

## Deadline and cancellation

The existing public Host clamps calls to at most 30000ms. Bridge forwards the
admitted absolute deadline and AbortSignal to the process runner. The parent
uses process-group TERM, then KILL with bounded cleanup checks. Cancellation
acknowledgment can precede process cleanup. Unconfirmed disappearance poisons the
runner rather than certifying success. A closed/poisoned runner rejects reuse.
The live child uses its own outer120s / guard119s ceiling, NOT the remaining
public30s; the parent enforces public30. There is no promise of remote cancellation,
provider token/generation/billing limits, or crash-proof parent cleanup.

## Actual public error mapping

- Contract-invalid input: INVALID_ARGUMENT; neutral unsupported task: INVALID_ARGUMENT.
- Denied consumer authority: PERMISSION_DENIED before dispatch/activation.
- Closed runner, missing executable, nonzero native child exit: UNAVAILABLE.
- Concurrent runner/provider execution: RESOURCE_EXHAUSTED.
- Expired admitted deadline: DEADLINE_EXCEEDED; supported abort: CANCELLED.
- Malformed child JSON/output overflow: INTERNAL.
- Allowed bridge codes also include FAILED_PRECONDITION. Unknown exception codes
  are normalized to INTERNAL without raw exception text.

Important distinction: Python policy/model/tool failures cause a nonzero child
exit in the executable route and therefore surface as UNAVAILABLE, not as the
original Python BudgetDenied code. Native stdout is redirected/suppressed; raw
stderr is bounded and not returned through ACAP. Do not infer fine-grained public
model/tool error codes from helper-only tests.

## Diagnostics and evidence boundaries

Internal events carry request ID, admitted deadline and caller metadata; results
carry correlated normalized value/code. Retained external reports record mode,
consumer/snapshot digests, result and resource/runner disposal state. They are not
full native transcripts or a persistent correlation audit log. The public native
success/failure tests additionally retain bounded PHASE3_PUBLIC_EVIDENCE records:
actual execution requestId, capability/provider/instance/generation, lifecycle,
start/end, normalized code and cleanup/resources/runner state. On failure the
public AcapError has its own correlationId: frozen normalization intentionally
creates a fresh error. Both actual IDs are recorded and linked by the one awaited
invocation and single-flight execution; equality is neither required nor claimed.
Receipt assertions prove the actual native tool handler ran. Canary scans cover
stdout/stderr and persistent request artifacts. These are test-owned evidence,
not a generic production telemetry service. See SECURITY.md and LIMITATIONS.md.
