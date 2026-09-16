# ALICA-KERNEL-API-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## Trusted boundary

The Kernel owns Cell bootstrap, registry, resolver, lifecycle, scopes, grant enforcement, trust verification hooks, owned event dispatch, secret-reference mediation and audit emission. It MUST NOT implement domain memory, agent loops, sessions, UI, identity-server integration, database products or release signing. Manifest parsing is data-only; executable configuration is forbidden.

## Public interfaces

The public host API comprises `bootstrap(config)`, `plan(profile)`, `activate(pluginId, scopeId)`, `quiesce(pluginId)`, `dispose(pluginId)`, `destroyScope(scopeId)`, `inspect(query)` and `shutdown()`. Bootstrap takes a locally provisioned Cell identity and pinned trust policy; profile data MUST NOT override either. `plan` is non-mutating and returns exact selections and exclusions. Inspection MUST redact credentials and secret values. Mutating host APIs require operator authority and MUST NOT be exposed to ordinary plugins.

The plugin context comprises `provide(descriptor, implementation)`, `require(requirement)`, `optional(requirement)`, `effect(acquire)`, `on(event, handler)`, `emit(event)`, `secret(reference)` and `log(record)`. Its principal, plugin instance and scope are immutable Kernel-supplied bindings. `provide` returns an owned disposer, never a registry mutation handle. `require` returns a revocable proxy, never an implementation object. `optional` returns absence only for unavailable compatible capability; permission denial is an error, not absence. Effects register cleanup before becoming externally visible; acquisition failure MUST clean partially acquired resources.

## Lifecycle

Legal paths: DISCOVERED -> VERIFIED -> RESOLVED -> ACTIVATING -> ACTIVE -> QUIESCING -> DISPOSED. A pre-ACTIVE error enters FAILED after attempted cleanup; ACTIVE errors quiesce before FAILED. FAILED instances MUST NOT reactivate; create a new instance. Repeated disposal of DISPOSED is a successful no-op. No outgoing transition exists from DISPOSED. VERIFIED requires accepted signatures and digests before evaluating code. RESOLVED requires all mandatory dependencies and grant feasibility. ACTIVATING effects stay staged until atomic publication of ACTIVE. A required-dependency cycle is rejected; optional dependencies MUST NOT create activation ordering edges and cannot be acquired during activation to manufacture a cycle.

Quiesce prevents new calls/registrations, waits at most the operator timeout, then cancels remaining calls and disposes effects in reverse acquisition order. Cleanup errors are aggregated; other disposers still run. Child scopes quiesce before parents. An uncooperative in-process module may require Cell restart; it is not sandboxed. Isolated providers can be terminated at the deadline. Never report complete cleanup if cleanup failed.

## Audit and failure

Security-relevant actions include activation decisions, grant denial/revocation, trust rejection, scope destruction and cleanup failure. Emit actor, target, scope, outcome, stable reason, timestamp and correlation ID; never payload/secret values by default. The local audit mechanism is bounded. Failure to record a security-sensitive mutation MUST block that mutation; emergency revocation/termination still proceeds and reports audit unavailability to the operator. Crash recovery rebuilds registry from verified profile, not persisted object handles. Policy changes and state writes are atomic; recovery MUST NOT silently lower trust.
