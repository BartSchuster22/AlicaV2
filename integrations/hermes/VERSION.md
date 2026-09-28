# Phase3 pinned versions and evidence provenance

- Hermes external commit: `c04e9a1d0dfa4abbefe4b256428e645abaacfe88` (MIT).
- Frozen Phase2: `736b37d03c82ca057e7a397644037ef5d1bed991`, `phase2-catalog-v1.0.0`.
- Tested implementation/consumer candidate: `dd6ae75805fb7e72aa1a4b035a06c8b2c08f18e3` on `phase3/hermes`.
- ALICA toolchain: Node24.21.0, npm11.19.0; original isolated Python3.14.7.
- Fresh upstream-supported install: Python3.14.7, uv0.12.3; upstream PM bootstrapped Node26.7.0 for its own installer. ALICA tests explicitly use Node24.21.0.
- Standalone installation used `source ./activate --test-environment` in a fresh HOME/HERMES_HOME and runtime-tools directory. No existing user profile or credentials copied.
- Registry/plugin-boundary baseline: 91 passed. Initial run without uv on PATH: 84 passed/7 setup errors; preserved, corrected by using the installed uv, no source edit.
- Runtime direct dependencies inspected: openai2.24.0 Apache-2.0; httpx0.28.1 BSD-3-Clause. Hermes stays external; no new npm dependency/manifests/lock change.
- Selected EXPERIMENTAL snapshot: `sha256:98aa324f38e7a25cbdaeb62174ad0644c1ca0dbbf2964a0f60390cbd76c43559`.
- Unchanged consumer digest: `sha256:aaaf85e09346643be3735780918185ff2632958a29a87f57b5caec00034a73aa`.

## Historical live versus current MOCK qualification

Original H12 actually passed on the historical route at base HEAD `45056ab431939d41680cb23005743fd1c0005e1f` plus reviewed WIP, not an invented clean commit. Historical native_binding.py SHA256:
`f1a7d6a5f9ded6019f101fd64dd50b9917e443e50df540b0b5ba6e46296e68cc`.
Two physical reservations of the three-total grant were consumed. Result was `ALICA request-scoped fixture`; original auth absent, both attempt markers retained, resources zero and runner closed. Remaining one is NOT authority.

Current committed native_binding.py SHA256:
`2fbef32413bb7aa61a4686f5e9a1961e5bf97bdb626b1bc6e1482224b1490d29`.
Its added finite config/pin/tool checks and trusted-child logging suppression were independently reviewed and MOCK-tested, not live-rerun. Original H12 remains historical proof, not attestation of new bytes. New public failure evidence test SHA256:
`2a99a33970d54fd2a3120f39b8932b02fcd8916952ac519a30c7180b77072825`.

The clean candidate clone started with an empty Git status, installed from package-lock, built, and passed all listed MOCK suites. Build generated only the two existing untracked Catalog schema files; no tracked diff. The source readback without .git was NOT used as clean reproduction. Exact logs and dispositions: [EVIDENCE](../../docs/phase3/EVIDENCE.md).
