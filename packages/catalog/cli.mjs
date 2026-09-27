import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { canonical } from '@alica/acap-contracts';
import { insist } from './index.mjs';
import { compatibility, validateProposal } from './governance.mjs';
import {
  loadCatalog,
  createIndex,
  createSnapshot,
  consumeSnapshot,
} from './release.mjs';

export function catalogMain(args) {
  try {
    const [action, ...tail] = args;
    const positional = [],
      flags = {};
    for (let i = 0; i < tail.length; i++) {
      const arg = tail[i];
      if (arg === '--json') continue;
      if (arg.startsWith('--')) {
        insist(
          ['--root', '--out', '--snapshot'].includes(arg) &&
            !Object.hasOwn(flags, arg) &&
            tail[i + 1] &&
            !tail[i + 1].startsWith('--'),
          'INVALID_ARGUMENT',
        );
        flags[arg] = tail[++i];
      } else positional.push(arg);
    }
    let result;
    if (action === 'proposal') {
      insist(
        positional.length === 2 &&
          positional[0] === 'validate' &&
          Object.keys(flags).length === 0,
        'INVALID_ARGUMENT',
      );
      result = {
        valid: true,
        proposal: validateProposal(
          JSON.parse(readFileSync(positional[1], 'utf8')),
        ).id,
      };
    } else if (action === 'diff') {
      insist(
        positional.length === 2 && Object.keys(flags).length === 0,
        'INVALID_ARGUMENT',
      );
      const [a, b] = positional.map((p) => loadCatalog(p));
      // Never choose a historical version by file order or lexical sorting.
      for (const catalog of [a, b]) {
        const ids = catalog.entries.map((e) => e.definition.metadata.id);
        insist(new Set(ids).size === ids.length, 'AMBIGUOUS_DIFF_VERSION');
      }
      const changes = [];
      for (const old of a.entries) {
        const d = old.definition;
        const next = b.entries.find(
          (e) => e.definition.metadata.id === d.metadata.id,
        );
        changes.push({
          id: d.metadata.id,
          ...(next
            ? compatibility(old, next)
            : {
                classification: 'BREAKING',
                reasons: [
                  { classification: 'BREAKING', reason: 'capability removed' },
                ],
              }),
        });
      }
      for (const next of b.entries)
        if (
          !a.entries.some(
            (e) => e.definition.metadata.id === next.definition.metadata.id,
          )
        )
          changes.push({
            id: next.definition.metadata.id,
            classification: 'BACKWARD_COMPATIBLE',
            reasons: [],
          });
      result = {
        classification: changes.some((x) => x.classification === 'BREAKING')
          ? 'BREAKING'
          : changes.some((x) => x.classification === 'REVIEW_REQUIRED')
            ? 'REVIEW_REQUIRED'
            : 'BACKWARD_COMPATIBLE',
        changes,
      };
    } else {
      insist(
        ['validate', 'list', 'show', 'index', 'snapshot'].includes(action),
        'INVALID_ARGUMENT',
      );
      insist(
        positional.length === (action === 'show' ? 1 : 0),
        'INVALID_ARGUMENT',
      );
      insist(!(flags['--root'] && flags['--snapshot']), 'INVALID_ARGUMENT');
      insist(
        !flags['--out'] || ['index', 'snapshot'].includes(action),
        'INVALID_ARGUMENT',
      );
      insist(
        !flags['--snapshot'] || ['validate', 'list', 'show'].includes(action),
        'INVALID_ARGUMENT',
      );
      const offline = flags['--snapshot']
        ? consumeSnapshot(JSON.parse(readFileSync(flags['--snapshot'], 'utf8')))
        : null;
      const catalog = offline
        ? { entries: offline.entries, release: { version: offline.version } }
        : loadCatalog(flags['--root'] || 'catalog');
      if (action === 'validate')
        result = {
          valid: true,
          entries: catalog.entries.length,
          trustVerified: false,
        };
      if (action === 'list') result = createIndex(catalog);
      if (action === 'show') {
        result = catalog.entries.filter(
          (e) => e.definition.metadata.id === positional[0],
        );
        insist(result.length > 0, 'NOT_FOUND');
      }
      if (action === 'index') result = createIndex(catalog);
      if (action === 'snapshot') result = createSnapshot(catalog);
      if (flags['--out']) {
        mkdirSync(dirname(flags['--out']), { recursive: true });
        writeFileSync(flags['--out'], canonical(result) + '\n', { flag: 'wx' });
      }
    }
    console.log(canonical(result));
    return 0;
  } catch (error) {
    console.error(
      canonical({ valid: false, error: error.code || 'INVALID_CATALOG' }),
    );
    return 1;
  }
}
