# Hermes ↔ ACAP Phase3 reproduction

Finite external Hermes adapter, not a general agent platform or hostile-code sandbox.
Read [VERSION](VERSION.md), [mapping](docs/CAPABILITY-MAPPING.md), [security](docs/SECURITY.md), [limitations](docs/LIMITATIONS.md), [acceptance](../../docs/phase3/ACCEPTANCE.md) and [evidence](../../docs/phase3/EVIDENCE.md).

## Clean pinned Hermes baseline (no model call)

Prerequisites: Linux, Git, Bash, network access to install published dependencies, Node24.21.0/npm11.19.0 for ALICA. Use a new disposable directory and HOME. Do not reuse an authenticated Hermes profile.

```sh
mkdir phase3-repro
cd phase3-repro
export REPRO="$PWD"
mkdir home tools
export HOME="$REPRO/home" HERMES_HOME="$REPRO/home/.hermes" HERMES_RUNTIME_DIR="$REPRO/tools"
git clone https://github.com/NousResearch/hermes-agent.git hermes
git -C hermes checkout --detach c04e9a1d0dfa4abbefe4b256428e645abaacfe88
cd hermes
source ./activate --test-environment
```

The upstream pinned installer provisions its toolchain and test environment. Use the test environment's `venv/bin/python` beneath `$HERMES_HOME/installs/*/test-environment/gen-*/`; with a fresh HOME there is one generation. Record the selected absolute executable as PHASE3_PYTHON. Include `$REPRO/tools/uv-0.12.3-linux-x64` on PATH for the plugin install tests (they require real uv).

```sh
export PHASE3_PYTHON="$(printf '%s\n' "$HERMES_HOME"/installs/*/test-environment/gen-*/venv/bin/python)"
export PHASE3_HERMES="$REPRO/hermes"
export HERMES_PHASE3_SOURCE="$PHASE3_HERMES"
export PATH="$REPRO/tools/uv-0.12.3-linux-x64:$PATH"
"$PHASE3_PYTHON" -m pytest -q tests/tools/test_registry.py tests/tools/test_plugin_guard.py tests/hermes_cli/test_plugin_runtime_disable_gate.py
```

## Clean committed ALICA MOCK reproduction

Use Node24.21.0/npm11.19.0 explicitly, not the upstream installer's separate Node. Verify `node --version` and `npm --version` before continuing. No live credentials or original authority directory is needed or authorized.

```sh
cd "$REPRO"
git clone https://github.com/BartSchuster22/AlicaV2.git alica
cd alica
git checkout --detach dd6ae75805fb7e72aa1a4b035a06c8b2c08f18e3
git status --short
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run typecheck
npm test
npm run test:catalog
node --experimental-vm-modules --test integrations/hermes/tests/*.test.mjs catalog/proposals/agent-execution/reference.test.mjs
npm run test:external
node tools/test-external-catalog.mjs
node tools/test-external-hermes.mjs --qualify
node --experimental-vm-modules --test tools/test-external-hermes-cleanup.mjs
npm run boundaries
npm run secrets
cd integrations/hermes/adapter
export PYTHONPATH="$HERMES_PHASE3_SOURCE:$PWD" PYTHONDONTWRITEBYTECODE=1
"$PHASE3_PYTHON" -W error::ResourceWarning -m unittest -v test_request_budget test_guarded_responses test_pinned_payload test_live_authority test_live_entry test_final_native
"$PHASE3_PYTHON" test_native_success_cleanup.py
"$PHASE3_PYTHON" test_native_failures.py
```

The exact candidate has been reproduced from a clean Git clone, including fresh upstream installation, and is now publicly available with anonymous source/docs readback. Main discovery is published at `03661859a93517b0450e7873e857a843db65e262`. Release documentation is identified by annotated `phase3-hermes-v1.0.0`; its tag metadata identifies the final docs commit while the tested implementation remains `dd6ae758`. See [completion](../../docs/phase3/PHASE3-COMPLETION.md). Phase3 ends here: FREEZE and STOP before JEV/services; no final owner acceptance is asserted.

Expected: `ALICA request-scoped fixture` from both neutral/native providers, equal consumer digest, both PHASE3_PUBLIC_EVIDENCE records, zero owned resources, closed/nonpoisoned runner. All model responses here are MOCK. The external author installs packed public SDK/Catalog artifacts without Kernel; a separate trusted operator uses packed public Host, not Kernel source. All generated temp authority is disposable; the original live grant is not touched.

`npm run dependencies` remains a known frozen checker failure at `@alica/catalog`, identically reproduced at frozen Phase2. It is not reported green. No dependency graph change was made. The build's two generated Catalog schema files remain untracked; do not commit them as Phase3 changes.

Never use `--live` to reproduce this delivery. The original live task already passed, its remaining capacity is not permission, and credentials/grants/attempts must not be reset. Stop after Phase3; JEV/services require separate owner authorization.
