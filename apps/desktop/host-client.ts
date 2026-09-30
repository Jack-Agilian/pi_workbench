import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parseDesktopRequest, type DesktopReply, type DesktopRequest, type DesktopValue } from '../../packages/app-contracts/desktop.ts';
import { IpcSender } from '../../packages/pi-adapter/ipc-channel.ts';
import { exact } from '../../packages/app-contracts/worker-ipc.ts';
interface HostExit { code: number | null; signal: NodeJS.Signals | null }
interface Connection { child: ChildProcess; sender: IpcSender; ended: Promise<HostExit>; ready: Promise<void> }
/** Bounded, process-handle-bound transport. Disconnect rejects every pending request; nothing is replayed. */
export class HostClient {
  private connection?: Connection;
  private readonly pending = new Map<string, { connection: Connection; resolve(value: DesktopValue): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  private reconnecting?: Promise<void>;
  private stopped = false;
  private closeResult?: Promise<void>;
  private readonly node: string; private readonly root: string; private readonly profile: string;
  private readonly mode: '--demo'|'--model'|'--model-offline'|'--model-files-offline'|'--model-shell-offline';private readonly configuration?:string; private readonly denyModelNetwork: boolean;
  constructor(node: string, root: string, profile: string, mode:'--demo'|'--model'|'--model-offline'|'--model-files-offline'|'--model-shell-offline'='--demo', configuration?:string, denyModelNetwork=false) { this.denyModelNetwork=denyModelNetwork; this.node = node; this.root = root; this.profile = profile;this.mode=mode;this.configuration=configuration; }
  get processId() { return this.connection?.child.pid; }
  private start(): Connection {
    const home = join(this.profile, 'server-home'); const temp = join(home, 'tmp'); mkdirSync(temp, { recursive: true });
    const child = spawn(this.node, [...(this.mode==='--model'&&!this.denyModelNetwork?[]:['--import', join(this.root, 'scripts/probe-no-network.mjs')]), join(this.root, 'apps/agent-server/desktop-entry.ts'), this.mode, this.profile, ...(this.configuration?[this.configuration]:[])], {
      cwd: this.profile, stdio: ['ignore','ignore','ignore','ipc'], serialization: 'json',
      env: { HOME: home, USERPROFILE: home, TMPDIR: temp, TMP: temp, TEMP: temp, PATH: dirname(this.node),
        XDG_CONFIG_HOME: join(home, '.config'), PI_OFFLINE: '1', PI_SKIP_VERSION_CHECK: '1', PI_CODING_AGENT_DIR: join(home, 'agent'), NO_COLOR: '1' },
    });
    let ready!: () => void; let failed!: (e: Error) => void; let ended!: (exit: HostExit) => void;
    const connection: Connection = { child, sender: new IpcSender((m, cb) => child.send(m, cb)),
      ready: new Promise<void>((r, e) => { ready = r; failed = e; }), ended: new Promise<HostExit>(r => { ended = r; }) };
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
    let exit: HostExit | undefined; let disconnected = false;
    const complete = () => { if (exit && disconnected) { clearTimeout(startup); fail(); ended(exit); } };
    child.once('exit', (code, signal) => { exit = { code, signal }; complete(); });
    child.once('disconnect', () => { disconnected = true; complete(); });
    child.once('close', () => { if (!child.pid) { clearTimeout(startup); fail(); ended({ code: null, signal: null }); } });
    return connection;
  }
  connect(): Promise<void> { return this.stopped ? Promise.reject(new Error('disconnected')) : (this.connection ?? this.start()).ready; }
  async request(raw: DesktopRequest): Promise<DesktopValue> {
    return this.exchange({request:parseDesktopRequest(raw)});
  }
  async selectWorkspace(path:string):Promise<void> { if(typeof path!=='string'||!path||path.length>4096)throw new Error('invalid_workspace');await this.exchange({workspace:path}); }
  async protectCredentialDirectory(path:string):Promise<void> { if(typeof path!=='string'||!path||path.length>4096)throw new Error('invalid_directory');await this.exchange({protectedDirectory:path}); }
  async setModelKey(key:string):Promise<void> { if(typeof key!=='string'||!key||key.length>8192||/[\r\n\0]/.test(key))throw new Error('invalid_credential');await this.exchange({credential:key}); }
  private async exchange(payload:object):Promise<DesktopValue> {
    const connection = this.connection;
    if (this.stopped || !connection || !connection.child.connected) throw new Error('disconnected');
    await connection.ready;
    if (this.connection !== connection || !connection.child.connected) throw new Error('disconnected');
    if (this.pending.size >= 16) throw new Error('busy');
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('disconnected')); }, 10000);
      this.pending.set(id, { connection, resolve, reject, timer });
      void connection.sender.send({ id, ...payload }).catch(() => { clearTimeout(timer); this.pending.delete(id); reject(new Error('disconnected')); });
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
      this.closeResult = Promise.all([this.stop(this.connection), this.reconnecting?.catch(() => {})]).then(([exit]) => {
        // The trusted entry exits 0 only after DesktopHost.close succeeds. Termination
        // alone admits a new host for reconciliation, but never proves a clean shutdown.
        if (exit && (exit.code !== 0 || exit.signal !== null)) throw new Error('host_cleanup_unconfirmed');
      });
    }
    return this.closeResult;
  }
  /** A failed close remains failed. Only an explicitly created NEW client may take over after this barrier. */
  async waitForExit(): Promise<void> {
    if (!this.stopped) throw new Error('host_not_closed');
    await Promise.all([this.stop(this.connection), this.reconnecting?.catch(() => {})]);
  }
  private async stop(connection?: Connection): Promise<HostExit | undefined> {
    if (!connection) return;
    if (connection.child.connected) connection.child.disconnect();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([connection.ended, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('host_cleanup_unconfirmed')), 10000); })]); }
    finally { clearTimeout(timer); }
  }
}
