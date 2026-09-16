# ALICA V2 — G2 Engineering Foundation Report

## Status

Working foundation implemented and clean-checkout verification passed. Formal G2 EXIT is BLOCKED pending owner-only host controls and CI/enforcement verification or explicit approved equivalent. No production Kernel, SDK implementation or higher-level service integration was started.

## Verified deliverables

- Node 24.21.0 / npm 11.19.0, exact upstream download and SHA256 provenance.
- TypeScript 6.0.3 and Prettier 3.9.7 only as npm development dependencies; no npm production dependencies.
- Locked Python G1 design-test tooling (jsonschema 4.26.0, cryptography 50.0.1 and their transitive dependencies), installed into .tools without system Python changes.
- npm workspace, public exports, strict TypeScript configuration, deterministic build commands, npm lockfile and hash-required Python lock.
- Formatting/type/unit/schema checks, AST public-import boundaries, dependency/license policy and redacting secret-pattern checks.
- Least-privilege GitHub Actions workflow with SHA-pinned checkout and no retained checkout credentials.
- Contribution, setup, testing, private security-reporting, host-inspection and release-evidence/signed-candidate design documentation.

## Clean-checkout execution

Source commit: `b827cda24ae11901bb0afdd80e92f8fb81161c70`.

```sh
python3 tools/bootstrap.py
export PATH="$PWD/.tools/node/bin:$PATH"
npm ci --ignore-scripts
npm run check
git diff --exit-code
```

The test ran outside the development working tree with an empty HOME and no preinstalled Node on PATH. Dependency setup used network access to pinned upstream tool artifacts. It did not use V1 source at runtime, a V1 database or any ALICA service.

| Check | Result |
|---|---|
| Foundation tests | 14 passed |
| Retained G1 schema/design tests | 193 passed |
| Build/type/format/dependency/license checks | Passed |
| Planted public-boundary violation | Actual checker exited nonzero |
| Planted synthetic credential | Actual scanner exited nonzero; value remained redacted |
| Clean checkout remained unchanged | Verified |
| Output hashes vs development build and repeat rebuild | Identical |

Full execution/logs/input and artifact hashes: `evidence/g2/execution.json` and `clean-checkout-log.json`. Secret-pattern scanning is not comprehensive discovery; license checking is not a vulnerability audit. Upstream HTTPS hashes are not independent release-key signature verification.

## Owner completion actions

### 1. Read-only host security evidence

Owner root output has now been received: default effective root and password authentication, X11 forwarding and TCP forwarding are enabled; UFW is inactive. This requires remediation or explicit risk acceptance. The development account remains unprivileged. NTP synchronization was observed earlier; the enabled/running unattended-upgrades service does not by itself prove successful update installation. No SSH/firewall settings were changed.

The owner supplied output from these VPS root console/PuTTY commands (preserved in `evidence/g2/owner-host-inspection.json`):

```sh
/usr/sbin/sshd -T | grep -E '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|x11forwarding|allowtcpforwarding|authenticationmethods) '
ufw status verbose
systemctl --no-pager status unattended-upgrades --lines=5
```

The initial output request is fulfilled. Next establish tested owner key access and recovery before any hardening. Other/provider firewall controls, update scheduling/results and backup policy remain unverified; Match-specific rules need contextual checks. See `docs/operations/G2-HOST-SECURITY.md`. Merely supplying the output is not risk acceptance.

### 2. CI and required-check enforcement

GitHub API inspection was blocked by authentication (recorded 401/404 responses). SSH deploy-key push access does not grant access to Actions run details or branch protection. No remote-green status or enforced merge policy is claimed.

Check the repository Actions page for the `foundation` workflow, then Settings -> Rules/Branches for a required `foundation` check on main and relevant bypass settings. Provide results or narrowly scoped read-only access. If repository plan/settings cannot enforce the check, explicitly approve the recorded clean-checkout procedure as the alternative and define who must run/review it before merge. It is not automatically approved by this report.

## Gate decision

The engineering artifact is working and verified. G2 cannot honestly be declared fully complete until the two owner-only control items are resolved. Phase 3 has not begun.
