/** ACAP public data and provider contracts. No Kernel implementation imports. */
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type Value = JsonValue;
export interface PayloadSchema {
  type: 'object' | 'array' | 'string' | 'integer' | 'boolean' | 'null';
  properties?: Record<string, PayloadSchema>;
  required?: string[];
  additionalProperties?: false;
  items?: PayloadSchema;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  enum?: Value[];
  const?: Value;
  description?: string;
}
export interface Requirement {
  capabilityId: string;
  major: number;
  minMinor: number;
  maxMinor?: number;
  operations: string[];
  features: string[];
  optionalFeatures?: string[];
}
export interface Operation {
  name: string;
  kind: 'unary' | 'stream';
  input: PayloadSchema;
  output: PayloadSchema;
  idempotency: 'none' | 'provider';
  idempotencyPolicy?: {
    retentionMs: number;
    persistence: 'instance' | 'durable';
  };
}
export interface Descriptor {
  schemaVersion: 'acap.capability/v1';
  id: string;
  version: string;
  features: string[];
  operations: Operation[];
}
export interface EventDescriptor {
  schemaVersion: 'acap.event-descriptor/v1';
  id: string;
  version: string;
  payload: PayloadSchema;
}
export interface DescriptorBinding {
  version: string;
  descriptorDigest: string;
  descriptorPath: string;
}
export interface Manifest {
  schemaVersion: 'alica.plugin/v1';
  id: string;
  version: string;
  publisher: string;
  execution: 'inproc' | 'ipc';
  entrypoint: string;
  provides: (DescriptorBinding & { capabilityId: string })[];
  requires: Requirement[];
  optionalRequires: Requirement[];
  secretReferences: string[];
  publishedEvents: (DescriptorBinding & { eventType: string })[];
  subscribedEvents: (DescriptorBinding & { eventType: string })[];
}
export interface Grant {
  schemaVersion:
    'acap.grant/v1' | 'acap.secret-grant/v1' | 'acap.event-grant/v1';
  grantId: string;
  principal: string;
  instanceId: string;
  scope: string;
  scopeGeneration: number;
  issuedAtMs: number;
  expiresAtMs: number;
  revision: number;
  operations: string[];
  capabilityId?: string;
  secretRef?: string;
  eventType?: string;
}
export type Lifecycle =
  | 'DISCOVERED'
  | 'VERIFIED'
  | 'RESOLVED'
  | 'ACTIVATING'
  | 'ACTIVE'
  | 'QUIESCING'
  | 'DISPOSED'
  | 'FAILED';
export type ErrorCode =
  | 'INVALID_ARGUMENT'
  | 'UNAUTHENTICATED'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'INCOMPATIBLE_VERSION'
  | 'CONTRACT_MISMATCH'
  | 'CONFLICT'
  | 'DEADLINE_EXCEEDED'
  | 'CANCELLED'
  | 'UNAVAILABLE'
  | 'RESOURCE_EXHAUSTED'
  | 'FAILED_PRECONDITION'
  | 'INTERNAL';
export interface CallOptions {
  deadlineMs: number;
  signal?: AbortSignal;
  idempotencyKey?: string;
}
export interface OperationContext {
  readonly requestId: string;
  readonly deadlineMs: number;
  readonly signal: AbortSignal;
  readonly idempotencyKey?: string;
  readonly scopeGeneration?: number;
  readonly caller: Readonly<{
    principal: string;
    instanceId: string;
    scope: string;
  }>;
}
export type UnaryHandler = (
  input: Value,
  context: OperationContext,
) => Promise<Value>;
export type StreamHandler = (
  input: Value,
  context: OperationContext,
) => AsyncIterable<Value>;
export type Handler = UnaryHandler | StreamHandler;
export type Disposer = () => Promise<void>;
export interface BoundCapability {
  readonly descriptorDigest: string;
  readonly negotiatedFeatures: readonly string[];
  call(operation: string, input: Value, options: CallOptions): Promise<Value>;
  stream(
    operation: string,
    input: Value,
    options: CallOptions,
  ): AsyncIterable<Value>;
}
export interface EventEnvelope {
  eventId: string;
  type: string;
  contractDigest: string;
  sourceProvider: string;
  sourceScope: string;
  sourceInstanceId: string;
  scopeGeneration: number;
  sequence: number;
  timeMs: number;
  data: Value;
}
export interface KernelContext {
  readonly principal: string;
  readonly instanceId: string;
  readonly scope: string;
  readonly scopeGeneration: number;
  provide(descriptor: Descriptor, handlers: Record<string, Handler>): Disposer;
  require(requirement: Requirement): Promise<BoundCapability>;
  optional(requirement: Requirement): Promise<BoundCapability | null>;
  effect<T>(
    acquire: (registerCleanup: (dispose: Disposer) => void) => Promise<T>,
  ): Promise<T>;
  secret(ref: string): Promise<string>;
  on(type: string, handler: (event: EventEnvelope) => Promise<void>): Disposer;
  emit(type: string, data: Value): Promise<{ admitted: number }>;
  createScope(): KernelContext;
  log(record: {
    level: 'info' | 'warn' | 'error';
    event: 'checkpoint' | 'warning' | 'failure';
  }): void;
}
export interface CleanupReport {
  state: Lifecycle;
  completedDisposers: number;
  failedDisposers: ErrorCode[];
  timedOutResources: number;
  restartRequired: boolean;
}
export interface Signature {
  algorithm: 'ed25519';
  keyId: string;
  signature: string;
}
export interface TrustPolicy {
  schemaVersion: 'alica.trust-policy/v1';
  version: number;
  rootKeyIds: string[];
  publishers: {
    id: string;
    keyIds: string[];
    executionModes: ('inproc' | 'ipc')[];
  }[];
  issuedAtMs: number;
  expiresAtMs: number;
  maxOfflineAgeMs: number;
}
export interface Revocation {
  schemaVersion: 'alica.revocation/v1';
  version: number;
  issuedAtMs: number;
  expiresAtMs: number;
  revokedKeyIds: string[];
  revokedArtifactDigests: string[];
}
export interface Profile {
  schemaVersion: 'alica.profile/v1';
  profileId: string;
  version: string;
  plugins: { id: string; version: string; packageDigest: string }[];
  providerPins: { capabilityId: string; providerId: string }[];
  scopes: { id: string; parent: string | null }[];
}
