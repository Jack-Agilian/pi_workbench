import { OperationQueries, type OperationKey } from './operation-queries.ts';
import type { DesktopApi, DesktopThread } from '../../packages/app-contracts/desktop.ts';
import type { ArtifactView, OperationView, ProductEvent } from '../../packages/app-contracts/index.ts';
import type { DesktopPage, HistoryItem, PageOptions, ThreadActivity } from '../../packages/app-contracts/desktop-pages.ts';

type Source<T> = (options: PageOptions) => Promise<DesktopPage<T>>;
type Check = () => void;
/** Renderer-only range. Sources and opaque page positions carry no execution authority. */
class LoadedRange<T> {
  value?: DesktopPage<T>;
  private source: Source<T>; private identity: (item: T) => string;
  constructor(source: Source<T>, identity: (item: T) => string) { this.source=source; this.identity=identity; }
  copy() { const copy = new LoadedRange(this.source, this.identity); copy.value = this.value; return copy; }
  private async fetch(options: PageOptions, check: Check) {
    check(); const page = await this.source(options); check(); return page;
  }
  async refresh(check: Check, resumeAt?: string) {
    const item = this.value?.items.at(-1);
    const oldest = item ? this.identity(item) : resumeAt;
    let page = await this.fetch({limit: 8}, check);
    const items = [...page.items];
    while (oldest && !items.some(item => this.identity(item) === oldest) && page.hasMore) {
      const next = await this.fetch({limit: 8, cursor: page.nextCursor!}, check);
      page = {...next, snapshotSeq: Math.min(page.snapshotSeq, next.snapshotSeq)};
      items.push(...page.items);
    }
    this.value = {...page, items};
  }
  /** Bridge new insertions only to the known head; preserve the old tail's keyset chain. */
  async prepend(check: Check) {
    const old = this.value, head = old?.items[0];
    if (!old || !head) return this.refresh(check);
    let page = await this.fetch({limit: 8}, check);
    const added: T[] = [];
    for (;;) {
      const overlap = page.items.findIndex(item => this.identity(item) === this.identity(head));
      if (overlap >= 0) {
        this.value = {...old, items: [...added, ...page.items.slice(0, overlap), ...old.items]}; return;
      }
      added.push(...page.items);
      if (!page.hasMore) throw Error('page_cursor_invalid');
      page = await this.fetch({limit: 8, cursor: page.nextCursor!}, check);
    }
  }
  async more(check: Check) {
    if (!this.value) return this.refresh(check);
    if (!this.value.hasMore) return;
    const next = await this.fetch({limit: 8, cursor: this.value.nextCursor!}, check);
    this.value = {...next, snapshotSeq: Math.min(this.value.snapshotSeq, next.snapshotSeq), items: [...this.value.items, ...next.items]};
  }
}
export interface ThreadPagesView {
  history: DesktopPage<HistoryItem>;
  artifacts: DesktopPage<ArtifactView>;
  operations: ReadonlyMap<string, DesktopPage<OperationView>>;
}
interface State {
  history: LoadedRange<HistoryItem>; artifacts: LoadedRange<ArtifactView>;
  operations: Map<string, OperationKey>; cursor?: number;
}
type PageApi = Pick<DesktopApi, 'historyPage'|'historyEntry'|'artifactPage'|'operationPage'|'events'>;
// Explicit product invalidations. New/unknown event kinds resynchronize conservatively.
const historyKinds = new Set(['display.replaced','workspace.invalid','model.stop','model.length','model.cancelled',
  'model.provider_error','model.budget','model.protocol']);
const runKinds = new Set(['run.queued','run.starting','run.running','run.cancelling','run.unknown','run.completed','run.failed','run.cancelled']);
const operationKinds = new Set(['approval.requested','approval.allow','approval.deny','shell.launch','shell.outcome',
  'operation.executing','operation.succeeded','operation.failed','operation.unknown',
  'operation.late_succeeded','operation.late_failed','operation.late_unknown','operation.reconciled_succeeded','operation.reconciled_failed']);
const noDisplayKinds = new Set(['thread.created','thread.renamed','session.range','session.bound','session.persisted','session.rebound','model.request_reserved',
  'observation.activity','observation.idle','observation.diagnostic']);
interface BrowsePositions { history?: string; artifacts?: string; operations: Map<string, string | undefined> }
export class ThreadPages {
  private state: State;
  private queue: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private batch = 0;
  readonly tools: OperationQueries;
  private api: PageApi; readonly threadId: string;
  private readonly resume?: BrowsePositions;
  constructor(api: PageApi, threadId: string, scope: string = crypto.randomUUID(), resume?: BrowsePositions) {
    this.resume = resume;
    this.tools = new OperationQueries(api, scope, threadId);
    this.api=api; this.threadId=threadId;
    this.state = {history: new LoadedRange(page => api.historyPage(threadId, page), item => item.run.id),
      artifacts: new LoadedRange(page => api.artifactPage(threadId, page), item => item.id), operations: new Map()};
  }
  /** Already sent IPC reads may finish, but cannot publish or start the next read. */
  cancelPending() { this.generation++; this.tools.cancel(); }
  dispose() { this.cancelPending(); this.tools.dispose(); }
  /** Only opaque row positions cross a host restart, never Query data/status/promises. */
  browsePositions(): BrowsePositions {
    return {history: this.state.history.value?.items.at(-1)?.run.id ?? this.resume?.history,
      artifacts: this.state.artifacts.value?.items.at(-1)?.id ?? this.resume?.artifacts,
      operations: this.state.operations.size ? new Map([...this.state.operations].map(([id,key]) =>
        [id,this.tools.page(key).items.at(-1)?.id])) : this.resume?.operations ?? new Map()};
  }
  private serial(work: (state: State, check: Check) => Promise<void>): Promise<ThreadPagesView> {
    const generation = this.generation;
    const check = () => { if (generation !== this.generation) throw Error('pages_cancelled'); };
    const result = this.queue.then(async () => {
      check(); this.batch++; this.tools.retain(this.state.operations.values());
      const state: State = {...this.state, history: this.state.history.copy(), artifacts: this.state.artifacts.copy(),
        operations: new Map(this.state.operations)};
      try { await work(state, check); }
      catch (error) {
        check();
        if (!(error instanceof Error) || error.message !== 'page_cursor_invalid') throw error;
        check(); await this.resync(state, check);
      }
      check(); this.state = state; this.tools.retain(state.operations.values()); return this.view();
    });
    this.queue = result.catch(() => {}); return result;
  }
  view(): ThreadPagesView {
    const {history, artifacts, operations} = this.state;
    if (!history.value || !artifacts.value) throw Error('pages_not_loaded');
    return {history: history.value, artifacts: artifacts.value,
      operations: new Map([...operations].map(([id, key]) => [id, this.tools.page(key)]))};
  }
  private async readOperations(state: State, check: Check, changed = new Set<string>()) {
    for (const item of state.history.value!.items) {
      const id = item.run.id;
      const previous = state.operations.get(id);
      if (changed.has(id) || !previous) {
        const key = this.tools.key(id, this.batch);
        await this.tools.read(key, previous, false, check, this.resume?.operations.get(id)); state.operations.set(id, key);
      }
    }
  }
  private async read(state: State, check: Check) {
    await state.history.refresh(check, this.resume?.history); await state.artifacts.refresh(check, this.resume?.artifacts);
    await this.readOperations(state, check, new Set(state.history.value!.items.map(item => item.run.id)));
  }
  private async resync(state: State, check: Check) {
    await this.read(state, check);
    state.cursor = Math.min(state.history.value!.snapshotSeq, state.artifacts.value!.snapshotSeq,
      ...[...state.operations.values()].map(key => this.tools.page(key).snapshotSeq));
  }
  /** Reconnect starts a fresh page chain while preserving browsed depth. */
  refresh() { return this.serial((state, check) => this.resync(state, check)); }
  private async update(state: State, events: ProductEvent[], check: Check) {
    if (events.some(e => e.threadId !== this.threadId || (!historyKinds.has(e.kind) && !runKinds.has(e.kind) &&
      !operationKinds.has(e.kind) && !noDisplayKinds.has(e.kind) && e.kind !== 'artifact.recorded'))) {
      await this.read(state, check); return;
    }
    if (events.some(e => e.kind === 'run.queued')) await state.history.prepend(check);
    const changed = new Set(events.filter(e => historyKinds.has(e.kind) || runKinds.has(e.kind)).map(e => e.runId));
    const items = [];
    for (const item of state.history.value!.items) {
      if (!changed.has(item.run.id)) { items.push(item); continue; }
      check(); const entry = await this.api.historyEntry(this.threadId, item.run.id); check();
      items.push(entry.item);
    }
    state.history.value = {...state.history.value!, items};
    if (events.some(e => e.kind === 'artifact.recorded')) await state.artifacts.prepend(check);
    // Run cancellation/fencing can revoke tools without a separate operation event.
    await this.readOperations(state, check, new Set(events.filter(e => operationKinds.has(e.kind) || runKinds.has(e.kind)).map(e => e.runId)));
  }
  poll() { return this.serial(async (state, check) => {
    if (state.cursor === undefined) throw Error('pages_not_loaded');
    check(); const events = await this.api.events(this.threadId, state.cursor); check();
    if (events.length) {
      await this.update(state, events, check);
      // Only delivered events advance this watermark, not later snapshots (128-event batches).
      state.cursor = events.at(-1)!.seq;
    }
  }); }
  more(kind: 'history'|'artifacts'|string) {
    const expected = this.state.operations.get(kind);
    return this.serial(async (state, check) => {
    if (kind === 'history') { await state.history.more(check); await this.readOperations(state, check); }
    else if (kind === 'artifacts') await state.artifacts.more(check);
    else {
      const previous = state.operations.get(kind);
      if (previous !== expected) return; // Repeated click refers to the same displayed page, not a second advance.
      if (!previous) throw Error('run_not_loaded');
      const page = this.tools.page(previous); if (!page.hasMore) return;
      const key = this.tools.key(kind, this.batch, page.nextCursor);
      await this.tools.read(key, previous, true, check); state.operations.set(kind, key);
    }
  }); }
}
/** Reuse the existing display components, not the legacy unbounded thread request. */
export function projectPages(view: ThreadPagesView, activity: ThreadActivity): DesktopThread {
  const items = [...view.history.items].reverse();
  const operations = new Map([...view.operations.values()].flatMap(page => [...page.items].reverse()).map(op => [op.id, op]));
  for (const op of activity.operations) operations.set(op.id, op);
  return {thread: activity.thread, cursor: view.history.snapshotSeq,
    runs: items.map(item => item.run.id === activity.activeRun?.id ? activity.activeRun : item.run),
    inputs: items.map(item => ({id: item.run.id, text: item.input})),
    presentations: items.map(item => ({runId: item.run.id, value: item.presentation})),
    modelOutcomes: items.map(item => ({runId: item.run.id, value: item.modelOutcome})),
    operations: [...operations.values()], artifacts: view.artifacts.items};
}
