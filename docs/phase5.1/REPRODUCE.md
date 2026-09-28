# Safe public reproduction — Phase5.1 candidate

No technical release has been published yet. Before final review, the source-only candidate archive and `evidence/public-reproduction.json` identify the exact exercised source. After publication, select the exact reviewed public commit/tag; never assume a branch tip or synthetic fixture snapshot is the release. No production DB, API key, external MemoryV4 service, private control-file path, container daemon or paid/live provider is needed.

Qualified toolchain: repository-pinned Node 24.21.0 / npm 11.19.0, Linux x86_64, Python 3.12. Python direct and transitive versions are recorded in `services/memoryv4/requirements-qualified.txt`; npm uses the existing frozen lockfile. Native qualification requires root only to construct namespaces/chroot, then drops to the unprivileged owner of the source directory. It creates/removes only its own temporary fixture directory. No daemon, installed service, global permission/security setting or production file is changed.

## Unprivileged author/build and finite tests

From the unpacked candidate source (or exact reviewed public source after publication):

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
python3 -m venv .tools/memory-python
.tools/memory-python/bin/python -m pip install -r services/memoryv4/requirements-qualified.txt
node --experimental-vm-modules --test services/memoryv4/test-v2.mjs
```

The Node fixture creates its own stores under the system temp directory, supplies explicit offline authority and verifies same-record native/HTTP/ACAP behavior. Its trusted operator mapping is intentionally separate from the consumer payload. Import `memoryProvider` from `services/memoryv4/provider.mjs` with the admitted v2 descriptor, a trusted Host-caller resolver, and explicit absolute `{python, databasePath}` to compose it with the frozen SDK; do not put credentials or grant instructions in candidate input. No fallback to a default/shared production database is provided.

To run the finite Python suite safely, execute the runner inside an empty network namespace as the source-directory owner, with an empty environment. For example, an operator can invoke:

```sh
sudo unshare --net sudo -u "$USER" env -i PATH=/usr/bin:/bin HOME=/tmp \
  "$PWD/.tools/memory-python/bin/python" "$PWD/phase51/tools/run-python-tests.py" final
```

The runner requires the isolated namespace, sets an explicit disposable DB path before HTTP modules load, and supplies no API/production configuration. Do not run old live/diagnostic phase entry points or the repository's broad historical `npm run check` as a substitute. The scoped frozen regression is `npm test`; it uses only the existing foundation/kernel/contracts/SDK fixture suites.

## Native without containers

```sh
sudo env NODE_BINARY="$(command -v node)" python3 phase51/tools/isolate-native.py
```

The allowlisted root includes native Node/Python, required shared libraries, public package files, product source and minimal `/dev/null`. No container executable, daemon socket, `/srv`, user home or production config path is present. Tests run with an empty allowlisted environment under an unprivileged UID, separate mount/network/PID namespaces, and disposable data directories. Actual M7 is validated against the real admitted snapshot. Successful native output is `evidence/native-v2.log`, not inferred from manifest validity.

## Automated fresh-source reproduction

`phase51/tools/reproduce-public.py` archives the frozen Git baseline plus an explicit Phase5.1 source overlay, installs npm dependencies anew (offline public cache first, public registry fallback), creates a fresh Python environment and installs all pinned public Python dependencies, builds the frozen public packages, runs finite frozen regression, and executes Python plus integrated public-Host tests in isolated networks. The source-only artifact omits dependencies, interpreters, DBs and secrets. It does not push Git, publish, review or accept the candidate.

For minimal Python installations lacking ensurepip, that qualification tool uses a separately downloaded public `pip-24.3.1-py3-none-any.whl` placed under `.tools/` as a bootstrap import only. This is a dependency input, not a private package or runtime dependency. On a normal author machine the standard venv/pip commands above suffice.

```sh
sudo env NODE_BINARY="$(command -v node)" python3 phase51/tools/reproduce-public.py
```

Run only from an unprivileged-owner source checkout with the bootstrap wheel available. Tool output distinguishes dependency-fetch commands from network-isolated qualification. Reproduction never re-applies admission, reruns the design generator or synthesizes review records. `public-reproduction.json` records actual archive hash and command exit statuses; a failed command does not produce PASS.

Canonical export/import instructions and same-domain ledger exclusions: [PORTABILITY.md](PORTABILITY.md). Final review/publication remains a separate gate, not implied by successful commands.
