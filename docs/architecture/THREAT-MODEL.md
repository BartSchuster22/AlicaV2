# Step-1 threat model (proposed)

Assets: operator trust root, Cell identity, secret values, grant authority, provider identity, accepted artifacts, caller data, lifecycle integrity and availability.

Adversaries: malformed input sender, tampered package supplier, untrusted publisher with valid keys, malicious isolated provider, compromised trusted plugin, hostile local same-user process, privileged host attacker.

Boundaries: release bytes -> verifier -> loader; profile requests -> operator policy; plugin context -> broker; scope -> ancestor visibility; IPC peer -> authenticated launch record; secret reference -> value; runtime -> audit/evidence.

| Threat | Required control | Residual limit |
|---|---|---|
| Tampered package | pinned root, inventory signatures/digests before evaluate | compromised signing custody needs revocation |
| Scope escape/stale handle | immutable binding and per-call generation/grant checks | malicious trusted inproc can bypass language interfaces |
| IPC identity forgery | OS peer identity + launch-bound challenge | same-user adversary requires actual OS isolation |
| Deadline/cancel abuse | bounded request/queues and terminal state | external side effects are not rolled back |
| Malformed JSON | size/depth/type/duplicate rejection | production parser must bound work before allocation |
| Secret leak | explicit references, redaction, no ambient environment inheritance | trusted process may retain returned secret |
| Audit tamper | bounded protected local sink and failure policy | not proof against root attacker |
| Offline stale trust | monotonic metadata version/freshness and fail-closed expiry | prolonged disconnection can prevent activation |
| Host compromise | least privilege, operator hardening/recovery | root compromise is outside Kernel protection |

No claim of in-process malicious-code sandboxing. No test-only signing key may establish production trust. P0/P1 finding blocks qualification. Changes to this threat model require ADR and revised negative tests.
