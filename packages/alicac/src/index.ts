#!/usr/bin/env node
import {
  readFileSync,
  writeFileSync,
  statSync,
  realpathSync,
  existsSync,
} from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  descriptor,
  parse,
  canonical,
  digest,
  check,
  errorRecord,
  generateClient,
  generateProvider,
  generateDeclaration,
  validatePlugin,
  validateProfile,
  validateBundle,
  runConformance,
} from '@alica/acap-contracts';
import type { Descriptor } from '@alica/acap-types';
import type { ConformanceCase } from '@alica/acap-contracts';
import { loadProvider } from './provider-loader.js';
const usage =
  'alicac capability init --id org.example.echo --out capability.json\nalicac capability validate capability.json [--json]\nalicac capability generate-client capability.json --out client.mjs\nalicac capability generate-provider capability.json --out provider.mjs\nalicac plugin validate plugin.json [--json]\nalicac bundle validate bundle.json [--profile profile.json] [--json]\nalicac profile validate profile.json [--json]\nalicac conformance run --provider provider.mjs --fixtures fixtures.json [--descriptor capability.json] [--json]';
function read(path: string): Uint8Array {
  check(statSync(path).isFile());
  check(statSync(path).size <= 1048576, 'RESOURCE_EXHAUSTED');
  return readFileSync(path);
}
function text(path: string): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(read(path));
}
function reader(file: string) {
  const root = realpathSync(dirname(resolve(file)));
  return (name: string) => {
    check(typeof name === 'string' && !isAbsolute(name));
    const path = realpathSync(resolve(root, name));
    const rel = relative(root, path);
    check(
      rel !== '' && !rel.startsWith('..') && !isAbsolute(rel),
      'PERMISSION_DENIED',
    );
    return read(path);
  };
}
export async function main(args: string[]): Promise<number> {
  const json = args.includes('--json');
  try {
    if (args.length === 0 || args[0] === '--help') {
      console.log(usage);
      return 0;
    }
    const [group, action, ...tail] = args;
    const flags: Record<string, string | true> = {};
    const positional: string[] = [];
    for (let i = 0; i < tail.length; i++) {
      const x = tail[i]!;
      if (x.startsWith('--')) {
        check(!Object.hasOwn(flags, x));
        check(
          [
            '--json',
            '--id',
            '--out',
            '--provider',
            '--fixtures',
            '--descriptor',
            '--profile',
          ].includes(x),
        );
        if (x === '--json') flags[x] = true;
        else {
          const value = tail[++i];
          check(value && !value.startsWith('--'));
          flags[x] = value;
        }
      } else positional.push(x);
    }
    const allowed: Record<string, string[]> = {
      'capability init': ['--id', '--out', '--json'],
      'capability validate': ['--json'],
      'capability generate-client': ['--out', '--json'],
      'capability generate-provider': ['--out', '--json'],
      'plugin validate': ['--json'],
      'bundle validate': ['--profile', '--json'],
      'profile validate': ['--json'],
      'conformance run': ['--provider', '--fixtures', '--descriptor', '--json'],
    };
    const accepted = allowed[group + ' ' + action];
    check(accepted && Object.keys(flags).every((x) => accepted.includes(x)));
    let result: unknown;
    if (group === 'conformance' && action === 'run') {
      check(
        positional.length === 0 &&
          typeof flags['--provider'] === 'string' &&
          typeof flags['--fixtures'] === 'string',
      );
      const p = await loadProvider(flags['--provider']);
      const d = descriptor(canonical(p.descriptor));
      if (typeof flags['--descriptor'] === 'string')
        check(
          digest(d) === digest(descriptor(text(flags['--descriptor']))),
          'CONTRACT_MISMATCH',
        );
      result = await runConformance(
        d,
        p.handlers,
        parse(text(flags['--fixtures'])) as unknown as ConformanceCase[],
      );
      if (json) console.log(canonical(result));
      else {
        const report = result as Awaited<ReturnType<typeof runConformance>>;
        console.log(
          `Conformance ${report.passed ? 'PASS' : 'FAIL'} ${report.descriptorDigest}`,
        );
        for (const c of report.checks)
          console.log(
            `${c.passed ? 'PASS' : 'FAIL'} ${c.name}${c.code ? ' ' + c.code : ''}`,
          );
      }
      return (result as { passed: boolean }).passed ? 0 : 1;
    }
    if (group === 'capability' && action === 'init') {
      check(
        positional.length === 0 &&
          typeof flags['--id'] === 'string' &&
          typeof flags['--out'] === 'string',
      );
      const d: Descriptor = {
        schemaVersion: 'acap.capability/v1',
        id: flags['--id'],
        version: '1.0.0',
        features: [],
        operations: [
          {
            name: 'echo',
            kind: 'unary',
            idempotency: 'none',
            input: {
              type: 'object',
              properties: { text: { type: 'string', maxLength: 4096 } },
              required: ['text'],
              additionalProperties: false,
            },
            output: {
              type: 'object',
              properties: { text: { type: 'string', maxLength: 4096 } },
              required: ['text'],
              additionalProperties: false,
            },
          },
        ],
      };
      descriptor(canonical(d));
      writeFileSync(flags['--out'], canonical(d) + '\n', { flag: 'wx' });
      result = { valid: true, descriptorDigest: digest(d) };
    } else {
      check(positional.length === 1);
      const file = positional[0]!;
      const bytes = text(file);
      if (group === 'capability') {
        const d = descriptor(bytes);
        if (action === 'validate')
          result = { valid: true, descriptorDigest: digest(d) };
        else {
          check(
            typeof flags['--out'] === 'string' &&
              flags['--out'].endsWith('.mjs'),
          );
          const out = flags['--out'];
          const kind = action === 'generate-client' ? 'client' : 'provider';
          writeFileSync(
            out,
            kind === 'client' ? generateClient(d) : generateProvider(d),
            { flag: 'wx' },
          );
          writeFileSync(
            out.slice(0, -4) + '.d.mts',
            generateDeclaration(d, kind),
            { flag: 'wx' },
          );
          result = { generated: true, descriptorDigest: digest(d) };
        }
      } else if (group === 'plugin') {
        const d = validatePlugin(bytes, reader(file));
        result = { valid: true, digest: digest(d), trustVerified: false };
      } else if (group === 'bundle') {
        const b = validateBundle(
          bytes,
          reader(file),
          typeof flags['--profile'] === 'string'
            ? text(flags['--profile'])
            : undefined,
        );
        result = { valid: true, digest: digest(b), trustVerified: false };
      } else {
        const p = validateProfile(bytes);
        result = { valid: true, digest: digest(p) };
      }
    }
    console.log(json ? canonical(result) : 'PASS ' + canonical(result));
    return 0;
  } catch (e) {
    const error = errorRecord(e);
    console[json ? 'log' : 'error'](
      json
        ? canonical({ valid: false, error })
        : 'FAIL ' + error.code + ' ' + error.correlationId,
    );
    return 1;
  }
}
if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
)
  process.exitCode = await main(process.argv.slice(2));
