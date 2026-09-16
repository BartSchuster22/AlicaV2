# G2 host inspection — owner evidence received; disposition pending

Target: dedicated VPS 167.233.135.142, hostname ALICA-v1, development account alica-dev (no sudo). Earlier read-only observations: SSH TCP/22 publicly listening in the unprivileged socket view, local DNS listeners, synchronized NTP. Earlier agent inability to read protected SSH configuration is retained in historical evidence, not treated as the current owner-reported result.

## Owner-provided root console evidence

See `evidence/g2/owner-host-inspection.json` for the supplied output and provenance. This is owner-reported evidence, not an independent privileged agent inspection.

| Control | Reported result | Disposition |
|---|---|---|
| PermitRootLogin | yes | Root SSH allowed by default effective configuration |
| PasswordAuthentication | yes | Password authentication enabled; a usable root password is not established |
| PubkeyAuthentication | yes | Keys permitted; tested owner key access still unknown |
| KbdInteractiveAuthentication | no | Interactive keyboard authentication disabled |
| AuthenticationMethods | any | No configured multi-method requirement; does not mean unauthenticated login |
| X11Forwarding | yes | Disable if unnecessary after owner review |
| AllowTcpForwarding | yes | Review legitimate tunnels before restricting |
| UFW | inactive | No active UFW policy; other host/provider firewall layers unverified |
| unattended-upgrades.service | enabled, active | Service status only; successful/scheduled updates not established |

The unrestricted root/password configuration and inactive UFW require remediation or explicit, scoped owner risk acceptance before formal G2 closure. Returning inspection output is not risk acceptance. No SSH, firewall, account or login changes were made.

## Safe next steps — not yet authorized/executed

1. Identify and test the owner's key-based administrative access in a second session, while retaining the current root session. Verify provider console/recovery. The development account must remain unprivileged; do not give it sudo merely to complete inspection.
2. With owner approval, back up relevant configuration and plan SSH hardening appropriate to the verified owner access method. Validate with `sshd -t`, then reload and test a new connection before closing the original session. Do not disable root/password login blindly.
3. Inspect any existing nftables/iptables and provider firewall rules. If UFW is chosen, allow the verified SSH port/access path and other authorized traffic before enabling it. Re-test access and effective policy. Do not assume that inactive UFW means all network filtering is absent.
4. Review effective Match contexts using `sshd -T -C user=<login>,host=<client-host>,addr=<actual-client-IP>` for owner and development logins. Here host is the connecting client's hostname, not automatically the server hostname.
5. Confirm automatic update scheduling/recent results, provider firewall, owner console/MFA recovery and backup policy. Record remediation or explicit owner-approved exceptions and residual risks.

The host is not certified for production or hostile-plugin isolation. CI/required-check enforcement remains a separate unresolved G2 control. Historical clean-checkout test evidence is unchanged.
