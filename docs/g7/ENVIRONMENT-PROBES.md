# G7 OS-environment probe evidence

These are prerequisite feasibility probes, not G6 runtime or G7 candidate acceptance.
Owner approved scoped setup on Alicav1 and DSH2. Production signing/recovery custody remains undecided.

| Property | Alicav1 online | DSH2 disconnected |
| --- | --- | --- |
| Kernel | 6.8.0-139-generic | 7.0.0-30-generic |
| Landlock ABI queried | 4 | 8 |
| Dedicated runtime UID | 999 | 994 |
| Probe PID | 1 in separate PID namespace | 1 in separate PID namespace |
| Capabilities / privilege escalation | Capabilities dropped, no-new-privileges | Capabilities dropped, no-new-privileges |
| IPv4 / IPv6 TCP attempts | Both connected | Both failed with errno 101 (ENETUNREACH) |
| Networking boundary | Host network, independent mount/PID namespaces | Private network plus independent mount/PID namespaces |
| Temporary probe image | Removed per owner-supplied retry receipt | Removal independently verified over SSH |
| Probe service | Independently verified inactive/dead, collected | Independently verified inactive |

Neither probe is running persistently. Trusted OS baseline images remain under `/srv/alica-v2-g7-acceptance` for future disposable environment creation. No candidate has been installed.

## Evidence provenance

DSH2 original root-owned receipt was independently retrieved through authorized sudo; local archive is `/home/herman/g7-host-assessment/dsh2-setup-receipt.json`. Existing Docker application containers reported healthy afterward.

Alicav1 root-owned retry receipt was supplied by the owner from their root console, with completion timestamp `2026-09-17T18:08:19.697692+00:00`. The agent independently checked the collected/inactive service, but has not directly retrieved that root-owned JSON. Do not represent the owner's pasted receipt as an independently fetched file.

Alicav1 trusted OS SHA-256 reported by the receipt: `987e6e9f93860ae1f8334d02c4839f15653644f7fc1e0a507b07d05d1dadb3b4`.
DSH2 trusted OS SHA-256 recorded in its retrieved receipt: `6e6d0eec1fd1493774eb3a901d22c9c2fca5c61e56143c8a04db71293fba0dc2`.
These different OS hashes are expected and are NOT application profile digests.

## Probe correction and retained limits

The initial Alicav1 probe failed when Python 3.12 `Path.exists()` raised PermissionError for a ProtectHome-blocked path. Python 3.14 on DSH2 suppressed that error; therefore DSH2's historical `protected_paths_absent` wording must not be treated as proof that every tested path was absent rather than inaccessible.

The corrected probe uses lstat and distinguishes missing, inaccessible and unexpectedly exposed paths. Local and target-Python tests verified denied/missing handling and rejection of visible paths. The successful Alicav1 receipt explicitly records the development checkout as inaccessible and Docker socket as absent; root mount read-only flags were also checked.

Retry script SHA-256: `bf2103065efd73b16c3d188df18f416e59d3543b7fda3805201b558ce05a5dcb`.
Corrected probe SHA-256: `ce4d305ec0ec8429ea9944620a2674475e00103c82336f13641e86029ee58014`.
The retry preserved the original failure receipt, reused the existing image, and bound one root-owned corrected instrumentation file read-only over `/probe.py`. This overlay must be disclosed; it is not a signed application artifact or a development-directory mount.

Existing protections stayed enabled: ProtectHome, ProtectSystem=strict, private mounts/devices, kernel/control-group protections, no-new-privileges and dropped runtime capabilities. Probe limits remained one CPU, 1 GiB memory, zero swap allowance, 96 tasks and 90 seconds. No host-global security or firewall relaxation was performed.

## Still required

- Freeze accepted profile/lock, transaction/recovery formats and resource bounds.
- Approve signing/root/bootstrap verification and separately supplied recovery custody.
- Qualify actual G6 native workers on both OS/kernel combinations without relaxing confinement.
- Build and qualify a single signed, dependency-complete candidate with identical immutable application profile bytes on both environments.
- Run all G7 adversarial, interrupted-install, restart, upgrade and clean-restore tests, including real disconnected candidate behavior. OS-only network attempts do not substitute for application-level evidence.
- Retain the manual exact-revision CI and owner-acceptance boundary for G7.
