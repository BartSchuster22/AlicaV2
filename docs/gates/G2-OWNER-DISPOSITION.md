# G2 owner disposition before G3

Source: owner Telegram reports/screenshots, not independent root/API access.

Owner explicitly selected: **Approve the manual alternative and proceed with G3**.
GitHub remains private on the existing plan. Screenshots show foundation CI passed
for cf1d1b9 and 9618e22. Both rulesets and classic branch protection screens warn
that rules are not enforced for this private repository on the current plan.

Approved replacement: clean-checkout checks, successful CI for the exact candidate,
and owner approval before acceptance/release. This is a procedural control, NOT a
technical enforcement equivalent: writers can bypass it. A subsequent commit's
CI result is not inferred from these historical green runs.

Owner-assisted host changes and returned evidence:
- Tested owner Ed25519 login in a fresh session; password and keyboard-interactive
  SSH auth disabled; PermitRootLogin without-password. SSH reload succeeded.
- UFW enabled across reboot; default deny incoming / allow outgoing, TCP 22
  allowed on IPv4 and IPv6. Fresh owner key login works after firewall and reboot.
- Owner confirmed current provider snapshot/backup and working recovery console.
- Unattended upgrades configured daily; explicit Automatic-Reboot false.
  Manual real run returned 0, dpkg audit empty, required reboot performed.
- Post-reboot failed systemd units: none; reboot-required flag absent.
- Both apt timers scheduled; UTC, NTP active, system clock synchronized.

Residual facts: successful *scheduled* upgrade execution has not been established.
Provider-side firewall policy was not supplied; host UFW is verified by owner output.
X11/TCP forwarding were enabled in earlier inspection and were not subsequently
changed; these remain documented settings, not fictional disabled controls.

G2 accepted for progression by the owner's explicit alternative approval and G3
instruction. Production security/availability qualification is not claimed. No
GitHub visibility/plan changes or server-wide privileges were added to alica-dev.
