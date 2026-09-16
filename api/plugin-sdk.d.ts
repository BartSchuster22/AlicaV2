import type { KernelContext, Disposer, Descriptor, BoundCapability, Value, OperationContext, EventDescriptor, EventEnvelope } from '@alica/acap-types';
import type { ClientEndpoint } from '@alica/acap-contracts';
export type { Disposer, Descriptor, Requirement, BoundCapability, Value, Handler, OperationContext, CallOptions, EventDescriptor, EventEnvelope, } from '@alica/acap-types';
export interface SafeLogRecord {
    level: 'info' | 'warn' | 'error';
    event: 'checkpoint' | 'warning' | 'failure';
}
export interface TypedEvents<T extends Value = Value> {
    readonly descriptor: Readonly<EventDescriptor>;
    on(handler: (event: Readonly<Omit<EventEnvelope, 'data'> & {
        data: T;
    }>) => Promise<void>): Disposer;
    emit(data: T): Promise<{
        admitted: number;
    }>;
}
export type ProviderHandlers = Record<string, (input: never, context: OperationContext) => Promise<Value> | AsyncIterable<Value>>;
export interface PluginContext extends KernelContext {
    provide(descriptor: Descriptor, handlers: ProviderHandlers): Disposer;
    events<T extends Value = Value>(descriptor: EventDescriptor): TypedEvents<T>;
    createScope(): PluginContext;
}
export interface PluginDefinition {
    activate(context: PluginContext): void | Promise<void>;
}
export interface Plugin {
    activate(context: KernelContext): Promise<void>;
}
/** Same pending/result promise on every invocation, including failed cleanup. */
export declare function onceDisposer(dispose: Disposer): Disposer;
/** Only a host supplies this context. SDK validation never creates authority. */
export declare function createPluginContext(raw: KernelContext): PluginContext;
export declare function definePlugin(definition: PluginDefinition): Plugin;
/** Structural bridge from a broker handle to the G4 generated-client interface. */
export declare function clientEndpoint(handle: BoundCapability, d: Descriptor): ClientEndpoint;
