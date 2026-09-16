import { mkdirSync, writeFileSync } from 'node:fs';
import {
  canonical,
  generateClient,
  generateProvider,
  generateDeclaration,
} from '@alica/acap-contracts';
import { descriptor } from '../fixtures/g4/independent-provider.mjs';
mkdirSync('fixtures/g4/generated', { recursive: true });
writeFileSync('fixtures/g4/capability.json', canonical(descriptor) + '\n');
for (const kind of ['client', 'provider']) {
  writeFileSync(
    `fixtures/g4/generated/${kind}.mjs`,
    kind === 'client'
      ? generateClient(descriptor)
      : generateProvider(descriptor),
  );
  writeFileSync(
    `fixtures/g4/generated/${kind}.d.mts`,
    generateDeclaration(descriptor, kind),
  );
}
console.log('Generated deterministic G4 fixtures');
