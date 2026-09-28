# Proposed neutral record semantics

Not admitted. No frozen snapshot modified. URI acap://alica.io/example/records@1,
executable identity io.alica.example.records, version1.0.0.

put({key,value}) replaces a bounded opaque text record, returning {stored:true}
only after the reference write/rename completes. get({key}) returns the current
stored value with found:true. Observed absence is {found:false,value:''}; a
stored empty string is {found:true,value:''}. Failures are ACAP errors, never
successful absence. No universal truth enum is introduced.

Reference bounds:32 keys, key1–64 characters, value0–4096 characters. Writes are
serialized by the resource. Full capacity rejects a new key with RESOURCE_EXHAUSTED;
existing keys can be replaced. The implementation must not claim successful write
on failure. Calls already admitted can finish after cancellation; no rollback or
exactly-once promise. Consumers may read to reconcile uncertain outcomes.

Completed writes survive normal stop/start using the same operator-owned data
directory. New service instances must be discovered/activated using existing Host
primitives; old handles remain stale. There is no restart policy or supervisor.
No crash durability/fsync guarantee, multiwriter support, distributed consistency,
backup/restore execution, migration engine or database framework.

Native file I/O runs in the operator-owned reference resource. Public Host context
provides grants, calls and effect cleanup, not a public filesystem/storage API.
The signed shell and native attached author are NOT independently sandboxed. This
proves observed behavior and actual capability-grant enforcement, not hostile-code
filesystem isolation or authorization to arbitrary directories.

Declared authoritative domain example.records; data schema1.0.0; stopped-consistent
backup required, same-schema-only restart compatibility. Backup/migration
DECLARATION validity is distinct from execution NOT TESTED.
