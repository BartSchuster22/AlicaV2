# G6 design evidence

This is a design review candidate, not G6 acceptance evidence.

- `host-probe-initial.json`: actual peer/pidfd and Landlock discovery; Node failed on ambient OpenSSL configuration access.
- `host-probe-final.json`: repeated disposable probe with explicit read-only empty OpenSSL configuration; allowed read, forbidden reads/writes/symlink escape/network and sanitized Node environment checked. The probe is not the final confinement policy.
- `schema-checks.json`: actual closed/directional draft frame validation; deliberately false but well-formed names/digests illustrate that schema validation is not authentication.
- `working-check.log`: complete existing pipeline plus new schema checks.
- `review-summary.json`: observed check counts, compiler discovery and limitations.

See `docs/g6/QUALIFICATION.md` for every outstanding runtime test. G5 CI/acceptance and IPC-baseline approval remain recorded separately. No native dependencies, host-wide policy changes or containers were installed by this preparation.
