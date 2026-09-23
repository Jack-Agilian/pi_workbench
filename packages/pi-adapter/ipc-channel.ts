import { MAX_MESSAGE_BYTES } from '../app-contracts/worker-ipc.ts';
export type Send = (message: object, callback: (error: Error | null) => void) => boolean;
/** Bounded application queue plus serialized send callbacks; false means Node accepted but is congested. */
export class IpcSender {
  private pending = 0;
  private bytes = 0;
  private tail: Promise<void> = Promise.resolve();
  private closed = false;
  private readonly sendRaw: Send;
  private readonly limit: number;
  constructor(send: Send, limit = MAX_MESSAGE_BYTES) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_250_000) throw new Error('invalid_ipc_limit');
    this.sendRaw = send; this.limit = limit;
  }
  send(message: object): Promise<void> {
    const size = Buffer.byteLength(JSON.stringify(message));
    if (this.closed || size > this.limit || this.pending >= 16 || this.bytes + size > this.limit * 2) return Promise.reject(new Error('ipc_backpressure_or_closed'));
    this.pending++; this.bytes += size;
    const next = this.tail.then(() => new Promise<void>((resolve, reject) => {
      if (this.closed) { reject(new Error('ipc_closed')); return; }
      const timeout = setTimeout(() => reject(new Error('ipc_send_timeout')), 2000);
      try { this.sendRaw(message, error => { clearTimeout(timeout); if (error) reject(error); else resolve(); }); }
      catch (error) { clearTimeout(timeout); reject(error); }
    })).finally(() => { this.pending--; this.bytes -= size; });
    this.tail = next.catch(() => { this.closed = true; }); return next;
  }
  close(): void { this.closed = true; }
}
