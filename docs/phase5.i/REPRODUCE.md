# Standalone reference reproduction

Qualified profile: dedicated Ubuntu24.04 x86_64, Python3.12.3, Linux namespaces, root SETUP/operator with unprivileged APPLICATION execution. This is not an installer for production or an existing unrelated host. Never reset a host to run it. The named `alica-dev` setup account and `alica-phase5i-ref` non-root runtime account must already exist. Required OS commands: git, unshare, mount, chroot, setpriv, ip, ldd and runuser. Standard Ubuntu packages are git, python3.12, python3.12-venv, binutils, util-linux, iproute2 and ca-certificates. Configure these and the dedicated accounts on a disposable host before invoking the reproducer; it does not alter existing accounts.

Use anonymous HTTPS, no operator credentials inside the application. On a dedicated host, from the retrieved exact release checkout:

```sh
sudo python3 docs/phase5.i/reproduce.py --base /home/alica-dev/phase5i-public-my-clean-run
```

The base must not exist, must be a direct child named `/home/alica-dev/phase5i-public-*`, and requires at least 9GiB free before beginning. Failed attempts are retained, never reset/deleted. Root is only the setup/enclosure operator; actual application uses the dedicated non-root UID, cleared capabilities and no-new-privs. Setup obtains verified Node and uv binaries, publicly installs Python3.14.7 if absent, anonymously fetches the exact source carrier and both independent H/K pins, installs/builds fresh packages, then constructs a private runtime with no external network route or production home/credentials. Memory transitive versions are constrained without editing frozen requirements. Public package preparation, fixture code and all source dependencies are included or pinned. No /home/herman files, private source checkout or first-instance state is required.

The five stages print their status and retained log path: clean-public-build, clean-inputs, clean-root, clean-run, review-closures. Success requires actual K conformance, state-preserving whole write/stop/read, and H/D/G closure cases. Read `BASE/build-evidence/standalone-result.json`; a directory or partial receipt is not success. UUIDs/timestamps can differ. Publication qualification actually ran at DEV167.233.135.142 under `/home/alica-dev/phase5i-public-qualified-1`, not DSH2. The earlier two environments are separately recorded, not replaced.

## Bounded verification from anonymously retrieved published source

After independently verifying exact tag object, peeled commit and candidate manifest, use the downloaded entrypoint against a successful fully built reference base:

```sh
sudo python3 docs/phase5.i/reproduce.py --bounded-existing /home/alica-dev/phase5i-public-qualified-1
```

This mode verifies every reproducer/proof file against the qualified input hashes and rehashes immutable payload against its bound prelaunch manifest. It constructs the enclosure from the downloaded public source, starts/restarts only the reference backend, recovers the designated real domain state, repeats bounded H/D checks, requires zero K controls and no remaining owned process, and writes `public-bounded-result.json`. This is a bounded public-source replay, not a second full clean install. Its exclusive log prevents accidental repetition under the same evidence identifier. A new full `--base` run is the public clean-install route. Never substitute receipt existence for exit status and complete assertions.

All historical evidence is retained. The final technical tag is `phase5i-reference-instance-v1.0.0`; no accepted tag or production authority is implied.
