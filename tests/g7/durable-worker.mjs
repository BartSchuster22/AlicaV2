import { closeSync } from 'node:fs';
import {
  openPrivateRoot,
  durableWrite,
  readPrivate,
} from '../../tools/g7-durable.mjs';
const root = openPrivateRoot(process.argv[2]);
try {
  if (process.argv[3] === 'read')
    process.stdout.write(readPrivate(root, 'accepted.json').toString());
  else
    durableWrite(root, 'accepted.json', Buffer.from('target'), {
      replace: true,
      boundary(name) {
        if (name === process.argv[3]) {
          process.send(name);
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
        }
      },
    });
} finally {
  closeSync(root);
}
