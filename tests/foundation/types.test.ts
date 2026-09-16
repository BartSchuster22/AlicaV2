import type { JsonValue } from '@alica/acap-types';
const valid: JsonValue = { message: 'hello', flags: [true, null] };
// @ts-expect-error functions cannot cross the public data boundary
const invalid: JsonValue = () => valid;
void invalid;
