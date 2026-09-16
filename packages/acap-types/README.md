# Public type foundation

This package is intentionally types-only. `number` still requires the normative safe-integer runtime check; TypeScript cannot enforce that bound. G2 does not implement a broker, provider, Kernel or SDK. Consumers import `@alica/acap-types`, never another package's `src` or `dist` path. The exports map exposes only the public root.
