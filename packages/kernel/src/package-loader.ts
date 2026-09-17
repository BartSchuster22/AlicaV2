import { SourceTextModule, SyntheticModule } from 'node:vm';
import { posix } from 'node:path';
import * as sdk from '@alica/plugin-sdk';
import * as contracts from '@alica/acap-contracts';
import { AcapError, check } from '@alica/acap-contracts';
/** Only inventory-verified copied bytes and fixed public package roots. No
 * provider-controlled filesystem resolution, builtins or dynamic imports. */
export async function linkPackage(
  entrypoint: string,
  digest: string,
  modules: ReadonlyMap<string, string>,
): Promise<SourceTextModule> {
  const local = new Map<string, SourceTextModule>();
  const paths = new Map<SourceTextModule, string>();
  const shared = new Map<string, SyntheticModule>();
  const load = (path: string): SourceTextModule => {
    const prior = local.get(path);
    if (prior) return prior;
    const code = modules.get(path);
    check(code !== undefined, 'FAILED_PRECONDITION');
    const module = new SourceTextModule(code, {
      identifier: 'alica:' + digest + '/' + path,
      importModuleDynamically: () => {
        throw new AcapError('PERMISSION_DENIED');
      },
    });
    local.set(path, module);
    paths.set(module, path);
    return module;
  };
  const module = load(entrypoint);
  await module.link((specifier, from) => {
    if (
      [
        '@alica/plugin-sdk',
        '@alica/acap-contracts',
        '@alica/acap-types',
      ].includes(specifier)
    ) {
      let publicModule = shared.get(specifier);
      if (!publicModule) {
        const exports: Record<string, unknown> =
          specifier === '@alica/plugin-sdk'
            ? sdk
            : specifier === '@alica/acap-contracts'
              ? contracts
              : {};
        publicModule = new SyntheticModule(
          Object.keys(exports),
          function () {
            for (const [key, value] of Object.entries(exports))
              this.setExport(key, value);
          },
          { identifier: 'public:' + specifier },
        );
        shared.set(specifier, publicModule);
      }
      return publicModule;
    }
    check(
      /^(?:\.\.?\/)[A-Za-z0-9_./-]+$/.test(specifier),
      'FAILED_PRECONDITION',
    );
    const origin = paths.get(from as SourceTextModule);
    check(origin, 'FAILED_PRECONDITION');
    const target = posix.normalize(
      posix.join(posix.dirname(origin), specifier),
    );
    check(
      target !== '..' && !target.startsWith('../') && !posix.isAbsolute(target),
      'FAILED_PRECONDITION',
    );
    return load(target);
  });
  return module;
}
