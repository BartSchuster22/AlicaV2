import type { EventDescriptor, ErrorCode, CleanupReport, Lifecycle } from '@alica/acap-types';
import type { Plugin, PluginContext } from '@alica/plugin-sdk';
export type FailurePoint = 'activation' | 'revocation' | 'timeout' | 'cleanup';
export interface Permissions {
    capabilities?: Record<string, string[]>;
    publish?: string[];
    subscribe?: string[];
    secrets?: string[];
    scopes?: string[];
}
export interface InstanceOptions {
    id: string;
    scope?: string;
    permissions?: Permissions;
}
export interface TestOptions {
    events?: EventDescriptor[];
    secrets?: Record<string, string>;
    activationMs?: number;
    cleanupMs?: number;
    eventQueue?: number;
}
export interface Diagnostic {
    sequence: number;
    instanceId: string;
    event: string;
    code?: ErrorCode;
}
export interface TestInstance {
    readonly id: string;
    readonly state: Lifecycle;
    readonly context: PluginContext;
    failNext(point: FailurePoint, code?: ErrorCode): void;
    activate(plugin: Plugin): Promise<void>;
    dispose(): Promise<CleanupReport>;
}
export declare class TestCell {
    constructor(options?: TestOptions);
    instance(options: InstanceOptions): TestInstance;
    revoke(i: TestInstance): void;
    grantScope(i: TestInstance, scope: string): void;
    destroyScope(scope: string): Promise<void>;
    flush(): Promise<void>;
    inspect(): Readonly<{
        instances: {
            id: string;
            state: Lifecycle;
        }[];
        providers: number;
        subscriptions: number;
        pending: number;
        diagnostics: Diagnostic[];
        droppedDiagnostics: number;
    }>;
    close(): Promise<CleanupReport[]>;
}
export declare function createTestCell(options?: TestOptions): TestCell;
