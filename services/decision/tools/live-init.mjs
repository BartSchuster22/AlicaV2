// EXPLICIT operator-only one-time initialization, never invoked by tests/transport.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { initializeLedger, inspectLedger } from '../providers/typesafe-jev/ledger.mjs';
const path='/home/alica-dev/.local/state/alica/phase4/physical-requests.jsonl';
assert.deepEqual(process.argv.slice(2),['--initialize-once']);
assert.equal(process.cwd(),'/home/alica-dev/AlicaV2-phase4');
assert.equal(existsSync('docs/phase4/LIVE.json'),false,'Existing live evidence forbids new initialization');
assert.equal(existsSync(path),false,'Existing ledger must never be reset or reinitialized');
mkdirSync(dirname(path),{recursive:true,mode:0o700});
initializeLedger(path);
console.log(JSON.stringify({schema:'alica.phase4-live-init/v1',ledger:path,...inspectLedger(path),authenticatedRequestsSent:0}));
