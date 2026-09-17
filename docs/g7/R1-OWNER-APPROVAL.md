# G7 R1 owner approval

Recorded 2026-09-17T20:14:12.445583+00:00 (record time, not an inferred message timestamp).

Reviewed candidate: `6c9530adace11fb235a52d838ac10bc1dbf22ae2`. The owner selected:

> Approve R1: IPC-only profile and age/X25519 backups

This authorizes the concrete contract candidate and implementation, including an IPC-only first G7 profile, standard age/X25519 backup with the existing reserved recovery key, stopped-source backup/restore and local-only administration. It resolves the earlier draft G7-01 both-mode conflict for this profile. G6 in-process/IPC equivalence remains mandatory in regression. No new production keys, unattended signing, service migration, protected-host cleanup or final G7 acceptance is authorized. Actual release signing remains an owner terminal action.

The proposed age asset must still be retrieved/authenticated and qualified; approval is not evidence of successful encryption or restore. Models are not crash qualification.
