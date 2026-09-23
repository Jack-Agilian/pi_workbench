import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parseDesktopRequest, type DesktopReply, type DesktopRequest, type DesktopValue } from '../../packages/app-contracts/desktop.ts';
import { IpcSender } from '../../packages/pi-adapter/ipc-channel.ts';
import { exact } from '../../packages/app-contracts/worker-ipc.ts';
interface Connection { child: ChildProcess; sender: IpcSender; ended: Promise<void>; ready: Promise<void> }
/** Bounded, process-handle-bound transport. Disconnect rejects every pending request; nothing is replayed. */
export class HostClient {
  private connection?: Connection;
  private readonly pending = new Map<string, { connection: Connection; resolve(value: DesktopValue): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  private reconnecting?: Promise<void>;
  private stopped = false;
  private closeResult?: Promise<void>;
  private readonly node: string; private readonly root: string; private readonly profile: string;
  constructor(node: string, root: string, profile: string) { this.node = node; this.root = root; this.profile = profile; }
  get processId() { return this.connection?.child.pid; }
  private start(): Connection {
    const home = join(this.profile, 'server-home'); const temp = join(home, 'tmp'); mkdirSync(temp, { recursive: true });
    const child = spawn(this.node, ['--import', join(this.root, 'scripts/probe-no-network.mjs'), join(this.root, 'apps/agent-server/desktop-entry.ts'), '--demo', this.profile], {
      cwd: this.profile, stdio: ['ignore','ignore','ignore','ipc'], serialization: 'json',
      env: { HOME: home, USERPROFILE: home, TMPDIR: temp, TMP: temp, TEMP: temp, PATH: dirname(this.node),
        XDG_CONFIG_HOME: join(home, '.config'), PI_OFFLINE: '1', PI_SKIP_VERSION_CHECK: '1', PI_CODING_AGENT_DIR: join(home, 'agent'), NO_COLOR: '1' },
    });
    let ready!: () => void; let failed!: (e: Error) => void; let ended!: () => void;
    const connection: Connection = { child, sender: new IpcSender((m, cb) => child.send(m, cb)),
      ready: new Promise<void>((r, e) => { ready = r; failed = e; }), ended: new Promise<void>(r => { ended = r; }) };
    this.connection = connection;
    const fail = () => {
      connection.sender.close(); failed(new Error('disconnected'));
      for (const [id, pending] of this.pending) if (pending.connection === connection) { clearTimeout(pending.timer); this.pending.delete(id); pending.reject(new Error('disconnected')); }
    };
    const startup = setTimeout(() => { fail(); if (child.connected) child.disconnect(); }, 10000);
    let receivedReady = false;
    child.on('message', raw => {
      if (this.connection !== connection) return;
      try {
        if (!receivedReady) {
          const r = exact(raw, ['type']); if (r.type !== 'ready') throw new Error('invalid_ready');
          receivedReady = true; clearTimeout(startup); ready(); return;
        }
        const r = exact(raw, ['id','reply']); if (typeof r.id !== 'string') throw new Error('invalid_response');
        if (Buffer.byteLength(JSON.stringify(r.reply)) > 1_200_100) throw new Error('response_too_large');
        const reply = r.reply as DesktopReply; if (!reply || typeof reply.ok !== 'boolean') throw new Error('invalid_response');
        const pending = this.pending.get(r.id); if (!pending || pending.connection !== connection) return;
        clearTimeout(pending.timer); this.pending.delete(r.id);
        if (reply.ok) pending.resolve(reply.value); else pending.reject(new Error(reply.code));
      } catch { fail(); if (child.connected) child.disconnect(); }
    });
    child.on('error', fail); child.on('disconnect', fail);
    // With ignore/IPC stdio, this runtime can emit exit+disconnect without a close event.
    // Both are required before replacement; there are no stdout/stderr pipes left to drain.
    let exited = false; let disconnected = false;
    const complete = () => { if (exited && disconnected) { clearTimeout(startup); fail(); ended(); } };
    child.once('exit', () => { exited = true; complete(); });
    child.once('disconnect', () => { disconnected = true; complete(); });
    child.once('close', () => { if (!child.pid) { clearTimeout(startup); fail(); ended(); } });
    return connection;
  }
  connect(): Promise<void> { return this.stopped ? Promise.reject(new Error('disconnected')) : (this.connection ?? this.start()).ready; }
  async request(raw: DesktopRequest): Promise<DesktopValue> {
    const request = parseDesktopRequest(raw); const connection = this.connection;
    if (this.stopped || !connection || !connection.child.connected) throw new Error('disconnected');
    await connection.ready;
    if (this.connection !== connection || !connection.child.connected) throw new Error('disconnected');
    if (this.pending.size >= 16) throw new Error('busy');
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('disconnected')); }, 10000);
      this.pending.set(id, { connection, resolve, reject, timer });
      void connection.sender.send({ id, request }).catch(() => { clearTimeout(timer); this.pending.delete(id); reject(new Error('disconnected')); });
    });
  }
  /** Explicit restart only after the owned old host exits. Product command retry remains caller-controlled. */
  reconnect(): Promise<void> {
    if (this.stopped) return Promise.reject(new Error('disconnected'));
    if (!this.reconnecting) this.reconnecting = this.stop(this.connection).then(async () => {
      if (this.stopped) throw new Error('disconnected');
      this.connection = undefined; await this.connect();
      if (this.stopped) throw new Error('disconnected');
    }).finally(() => { this.reconnecting = undefined; });
    return this.reconnecting;
  }
  close(): Promise<void> {
    if (!this.closeResult) {
      this.stopped = true;
      this.closeResult = Promise.all([this.stop(this.connection), this.reconnecting?.catch(() => {})]).then(() => {});
    }
    return this.closeResult;
  }
  private async stop(connection?: Connection): Promise<void> {
    if (!connection) return;
    if (connection.child.connected) connection.child.disconnect();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([connection.ended, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('host_cleanup_unconfirmed')), 10000); })]); }
    finally { clearTimeout(timer); }
  }
}
