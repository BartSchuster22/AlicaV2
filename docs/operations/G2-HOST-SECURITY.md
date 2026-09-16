# G2 host inspection — unresolved privileged controls

Target: dedicated VPS 167.233.135.142, account alica-dev. Read-only observations: Ubuntu 24.04.4 LTS, kernel 6.8.0-138-generic; no sudo permission; only SSH TCP/22 publicly listening in the unprivileged socket view; local DNS listeners; NTP synchronized; unattended-upgrades active and enabled; UFW service enabled. Enabled UFW service is NOT evidence of effective filtering.

Readable sshd_config contains `PermitRootLogin yes` and X11Forwarding yes. The included cloud-init configuration is unreadable to alica-dev, and `sshd -T` fails on that include. Therefore effective password/root policy is UNKNOWN, not inferred from a partial file. `ufw status verbose` also requires root. No firewall/SSH/login changes were made.

## Owner-assisted read-only completion

From the owner root console/PuTTY session, run and return the output (no private keys/passwords):

```sh
/usr/sbin/sshd -T | grep -E '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|x11forwarding|allowtcpforwarding|authenticationmethods) '
ufw status verbose
systemctl --no-pager status unattended-upgrades --lines=5
```

If Match rules exist, also inspect `sshd -T -C user=alica-dev,host=ALICA-v1,addr=<actual-client-IP>` and the owner-login context. Host-provider firewall rules, console/MFA/recovery access and verified backup policy also require owner confirmation. Do not disable root/password login before another verified administrative path exists.

These controls are unresolved; ordinary low-privilege development can be exercised, but this is not a security-approved production host or hostile-plugin isolation environment. Formal G2 closure needs returned evidence/remediation or explicit owner-approved risk disposition.
