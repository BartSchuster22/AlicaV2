// Private inherited supervisor channel, never a provider or public admin channel.
import { Socket } from 'node:net';
export class OwnerChannel {
  #socket;
  #pending;
  #buffer = '';
  #command;
  next() {
    return new Promise((resolve) => {
      this.#command = resolve;
    });
  }
  constructor(fd) {
    this.#socket = new Socket({ fd, readable: true, writable: true });
    this.#socket.setEncoding('utf8');
    this.#socket.on('data', (data) => {
      this.#buffer += data;
      if (this.#buffer.length > 1024) process.exit(1);
      let end;
      while ((end = this.#buffer.indexOf('\n')) >= 0) {
        const message = this.#buffer.slice(0, end);
        this.#buffer = this.#buffer.slice(end + 1);
        if (message === 'ACK' && this.#pending) {
          const resolve = this.#pending;
          this.#pending = undefined;
          resolve();
        } else if (['STATUS', 'STOP'].includes(message) && this.#command) {
          const resolve = this.#command;
          this.#command = undefined;
          resolve(message);
        } else process.exit(1);
      }
    });
    // Loss of custody is never permission to keep publishing.
    this.#socket.on('error', () => process.exit(1));
    this.#socket.on('close', () => process.exit(1));
  }
  async send(message) {
    if (this.#pending) throw new Error('CONFLICT');
    await new Promise((resolve) => {
      this.#pending = resolve;
      this.#socket.write(JSON.stringify(message) + '\n');
    });
  }
}
