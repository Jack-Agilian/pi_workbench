import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDesktopRequest, type DesktopHome, type DesktopValue } from '../../packages/app-contracts/desktop.ts';
import { displayText } from '../../packages/app-contracts/presentation.ts';
import { contentId, inspectContent } from '../../packages/pi-adapter/approved-resources.ts';
import { digest, parametersDigest } from '../../packages/pi-adapter/controlled-tools.ts';
import { demoIntent } from '../../packages/pi-adapter/demo-intent.ts';
import { ProductCore } from './core.ts';
import { WorkerSupervisor } from './worker-supervisor.ts';
import { repository } from './worker-launcher.ts';

/** Trusted --demo App Server composition. The entire profile is owned by this launch, not chosen by a Renderer. */
export class DesktopHost {
  readonly core: ProductCore;
  readonly supervisor: WorkerSupervisor;
  private blocked = false;
  private closing = false;
  private closeResult?: Promise<void>;
  private running = false;
  constructor(profile: string) {
    mkdirSync(profile, { recursive: true, mode: 0o700 }); const root = realpathSync(profile);
    const workspace = join(root, 'workspace'); const database = join(root, 'host'); const state = join(root, 'state'); const resourcesRoot = join(root, 'resources');
    for (const dir of [workspace, database, state, resourcesRoot]) mkdirSync(dir, { recursive: true, mode: 0o700 });
    const manifest = join(resourcesRoot, 'package.json'); const content = JSON.stringify({ name: 'synthetic-desktop-resources', version: '1.0.0', pi: { skills: [] } });
    if (!existsSync(manifest)) writeFileSync(manifest, content, { flag: 'wx', mode: 0o600 });
    if (readFileSync(manifest, 'utf8') !== content) throw new Error('demo_resource_changed');
    const files = inspectContent(resourcesRoot);
    if (files.length !== 1) throw new Error('unapproved_demo_resources');
    this.core = new ProductCore(join(database, 'product.sqlite'), [{ id: 'demo-workspace', path: workspace }]);
    this.supervisor = new WorkerSupervisor(this.core, { stateDirectory: state, databaseDirectory: database,
      resources: { root: resourcesRoot, id: contentId(files), files, expectedSkillNames: [] } });
    this.recover();
  }
  private recover() { try { this.supervisor.recover(); this.blocked = false; } catch { this.blocked = true; } }
  private home(): DesktopHome {
    const threads = this.core.listThreads();
    return { mode: 'synthetic', threads: threads.map(t => ({ ...t, title: displayText(t.title, 160) })), recovery: this.blocked ? 'blocked' : 'ready',
      activeRuns: threads.flatMap(t => this.core.snapshot(t.id).runs).filter(r => ['starting','running','cancelling','unknown'].includes(r.state)) };
  }
  request(raw: unknown): DesktopValue {
    if (this.closing) throw new Error('host_closing');
    const request = parseDesktopRequest(raw);
    switch (request.type) {
      case 'home': return this.home();
      case 'thread': {
        const snapshot = this.core.snapshot(request.threadId);
        return { ...snapshot, thread: { ...snapshot.thread, title: displayText(snapshot.thread.title, 160) },
          inputs: this.core.runInputs(request.threadId).map(r => ({ id: r.id, text: displayText(r.input, 16384) })),
          presentations: snapshot.runs.map(r => ({ runId: r.id, value: this.core.presentation(r.id) })) };
      }
      case 'events': return this.core.eventsAfter(request.threadId, request.cursor);
      case 'preview': {
        const preview = this.core.previewArtifact(request.artifactId);
        return preview.text === undefined ? preview : { status: preview.status, text: displayText(preview.text, 1_048_576) };
      }
      case 'recover': this.recover(); this.pump(); return this.home();
      case 'command': {
        const ack = this.supervisor.command(request.command); this.pump(); return ack;
      }
    }
  }
  /** Only this trusted driver selects the registered write, exact bytes, target and deadline. */
  pump(): void {
    if (this.closing || this.blocked || this.running) return;
    const next = this.core.nextQueuedIntent(); if (!next) return;
    const args = demoIntent(next.id, next.input);
    const entry = join(repository, 'packages/pi-adapter/desktop-demo-worker.ts');
    try {
      const completion = this.supervisor.startNext({ tool: 'write', target: args.path, parametersDigest: parametersDigest(args),
        fileVersion: null, expectedContentDigest: digest(args.content), deadline: Date.now() + 120_000 },
      { path: entry, args: [JSON.stringify({ runId: next.id, input: next.input })] });
      if (!completion) return;
      this.running = true;
      void completion.catch(() => { this.blocked = true; }).finally(() => {
        this.running = false;
        if (this.closing) return;
        if (this.home().activeRuns.some(r => r.state === 'unknown')) this.blocked = true;
        this.pump();
      });
    } catch { this.blocked = true; }
  }
  close(): Promise<void> {
    if (!this.closeResult) { this.closing = true; this.closeResult = this.supervisor.close().finally(() => this.core.close()); }
    return this.closeResult;
  }
}
