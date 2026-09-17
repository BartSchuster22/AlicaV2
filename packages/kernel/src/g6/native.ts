import { createRequire } from 'node:module';
/** Opaque public-N-API external. Only native close/fileno may inspect it. */
export interface Lease {
  readonly __nativeLease: unique symbol;
}
export interface Native {
  pair(type: 1 | 5): [Lease, Lease];
  close(fd: Lease): void;
  fileno(fd: Lease): number;
  adopt(fd: number, type: 1 | 5): Lease;
  listen(path: string): Lease;
  accept(fd: Lease): Lease | null;
  credentials(fd: Lease): { pid: number; uid: number; gid: number };
  poll(fds: Lease[], timeout: number): number[];
  read(fd: Lease, size: number): Buffer | null;
  write(fd: Lease, bytes: Buffer): number;
  sendOffer(carrier: Lease, bytes: Buffer, fd: Lease): number;
  receiveOffer(carrier: Lease): { data: Buffer; handle: Lease } | null;
  pidfdOpen(pid: number): Lease;
  signal(pidfd: Lease, signal: 0 | 9 | 15): void;
  memfd(bytes: Buffer): Lease;
  managed(): number;
  seal(paths: string[], carrier: number, parentPid: number): number;
}
// Fixed private build artifact; no provider-controlled path or Node private API.
export const native = createRequire(import.meta.url)(
  new URL('../../../../native/g6/build/bridge.node', import.meta.url).pathname,
) as Native;
