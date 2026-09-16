# Contributing

Read the normative baseline and current gate before changing code. G2 is foundation-only; no Kernel implementation or service integration is authorized by this foundation change. Use short auditable commits explaining intent, and ADRs for architecture/security changes.

Run the [development setup](docs/development/SETUP.md) and `npm run check` before submitting. Do not import another package's source/dist paths, widen dependency allowlists without review, commit generated dependencies/builds, credentials, production data or V1 source. Update specifications, tests and documentation together.

The repository is private and UNLICENSED pending owner licensing decision. Do not publish packages. Workflow configuration is not evidence of enforcement; see the G2 gate for actual CI/required-check status.
