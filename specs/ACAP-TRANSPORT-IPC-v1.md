# ACAP-TRANSPORT-IPC-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## v1 local profile

Use local Unix-domain stream sockets with a 4-byte unsigned big-endian length prefix and UTF-8 JSON message. The length excludes the prefix and is 1..1048576. Reject length before allocating body; enforce frame and handshake timeouts. One accepted handshake per connection; require protocol version, Cell ID, provider instance, descriptor digests and a fresh supervisor-issued session challenge bound to the launched process/package. Read OS peer credentials and compare with the supervisor's expected identity. A self-reported providerId or shared socket access alone is not authentication. Exact OS isolation and peer-credential implementation are an ADR validation obligation before G6.

All frames are tagged: hello, accepted, request, response, error, cancel, stream-item, stream-credit, stream-end, event, ping, pong. Request IDs cannot be reused while outstanding. Caller identity is inserted by the trusted broker. Only the broker can issue consumer calls; provider-to-broker requests use provider authority. Unrecognized frame tags/fields close the session with a normalized error. A normative per-frame schema set MUST be added before implementing IPC; this phase freezes core envelope semantics, not a working transport.

Streams start with zero credit; receiver grants bounded item credit up to 256 outstanding items. Producer cannot send beyond credit, and total buffered bytes remain bounded. Cancellation closes delivery, releases credit and has one terminal outcome. Heartbeat interval defaults to 5 seconds, loss after 3 missed intervals; operator may tighten. Reconnect uses bounded exponential delay (1,2,4,8 seconds), at most four attempts, followed by FAILED; attempts are observable. A new session has a new generation and revalidates trust/grants. Outstanding calls fail UNAVAILABLE, never automatically replay. G6 must measure actual detection bounds under scheduling delay.

## G1 completion clauses

[ALICA-NORMATIVE-BASELINE-v1](ALICA-NORMATIVE-BASELINE-v1.md) resolves feature ranges, generations, lifecycle failure, secret/event grants, canonicalization, package digests and trust semantics. Its explicit completion clauses supersede conflicting earlier-draft wording.
