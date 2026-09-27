# Distinct parent review request — no review result asserted

Authoritative DEV root: /home/alica-dev/AlicaV2-phase3, phase3/hermes.
Frozen parent: 736b37d03c82ca057e7a397644037ef5d1bed991.
Reviewer must be distinct from the implementation author. Parent can independently
read/test these exact artifacts; no delegate tool is assumed. These are file-byte
SHA256 values, not descriptor canonical digests or approval tokens.

9544717f601d8aee4e89d04d900d2b31168874fb7c154885bdd623189daae4a6  catalog/proposals/agent-execution/proposal.json
28ed12a206d54a383a4332433fbf278adc9818dabbf0686d236dbcf772d018bf  catalog/proposals/agent-execution/descriptor.json
3257ea776bd4ba9a3816b4272efec41a02e70f149825d1a35c467383342ebdb5  catalog/proposals/agent-execution/reference.mjs
99c926fd6a6c6fd8590b7bd38fe7f0131ad4002366235163e720138dce875834  catalog/proposals/agent-execution/reference.test.mjs
6aae13be89efff3e596e863aaca52ee142f6307f2d28a96d74eddae23645dde0  catalog/proposals/agent-execution/README.md
2ed67da0af7333c9c5549c533801f277fdcf497a965ba5a5be9d61e6ad16cb8c  integrations/hermes/adapter/bridge.mjs
33a8388652ad1852098c7e0eb76c0eda8f38841275d05aacab146484c754f914  integrations/hermes/adapter/process-runner.mjs
35c88b57a890ecc7c2c8191ba35d246266a1406cd47e356970aba7497e27501d  integrations/hermes/tests/topology.test.mjs
b88af0faf223b5feb7afb9df4bc094b5ec4876a85968be2c7688293f5bf15cf8  integrations/hermes/tests/event-bridge.test.mjs
548c963bf176b7ea76673d139168b4d537da2d7f7d727857b7b9083932c47618  integrations/hermes/tests/lifecycle.test.mjs
bcd25970c24327314cdcfc6e659dd086fdedaddb2c7e983854e36d5cf4623215  integrations/hermes/docs/ARCHITECTURE.md

## Requested findings / decisions
1. Is task -> result generic enough? Finite reference rejects unsupported tasks;
   no model/tool/session/cancel capability or Hermes class leaks into the contract.
2. Verify explicit caller operation authority and separate provider event grants;
   source/correlation checks do not let foreign events create execution authority.
   Operator is trusted assembly with fixed executable/args/env, not caller code.
3. Review request-scoped no-retry semantics, absolute deadlines, cancellation race,
   process-group cleanup, late replies, output bounds and normalized exceptions.
   Caller cancellation acknowledgment precedes bounded local process cleanup;
   local cleanup is NOT remote provider cancellation or billing proof.
4. Candidate identity io.alica.agent.execution / acap://alica.io/agent/execution@1
   is NOT admitted. Namespace/release extension and maturity transition require
   governed maintainer action after actual independent review. Frozen echo stays.
5. Confirm no Kernel/ACAP/SDK change; no service or extra integration scope.

## Open issues / non-claims to preserve
- Hermes Python binding and isolated plugin/tool/provider policy enforcement still
  need implementation/test. Process lifecycle tests use controlled Node children,
  NOT fake model responses represented as Hermes evidence.
- Supported Codex model selection and dedicated safe DEV credential access await
  owner/parent resolution. Inference used0/3. No copied credentials or model calls.
- Persistent aggregate request cap, per-request1024 token/no-retry enforcement
  must be proved before any live model dispatch. No environment/profile inheritance.
- Provider-independent external project, missing/wrong Hermes version/model/tool
  failure matrix, real H12 and final H18/H20 remain open.
- 17 test executions include four imported topology tests twice; 13 distinct tests.
- This packet is an implementation handoff, NOT self-authored independent approval.

## Reproduce
Use pinned Node24.21.0 in the built DEV worktree:

    node --experimental-vm-modules --test integrations/hermes/tests/lifecycle.test.mjs integrations/hermes/tests/event-bridge.test.mjs catalog/proposals/agent-execution/reference.test.mjs

Observed17 pass/0 fail; foundation170 and Catalog15 pass; secret scan passes.
Record your identity, exact reviewed hashes, findings and disposition separately.
