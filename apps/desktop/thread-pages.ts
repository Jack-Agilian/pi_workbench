import type { DesktopApi, DesktopThread } from '../../packages/app-contracts/desktop.ts';
import type { ArtifactView, OperationView } from '../../packages/app-contracts/index.ts';
import type { DesktopPage, HistoryItem, PageOptions, ThreadActivity } from '../../packages/app-contracts/desktop-pages.ts';

type Source<T> = (options: PageOptions) => Promise<DesktopPage<T>>;
/** Renderer-only loaded range. Page cursors remain opaque and never become event cursors. */
class LoadedRange<T> {
  value?: DesktopPage<T>;
  private source: Source<T>; private identity: (item: T) => string;
  constructor(source: Source<T>, identity: (item: T) => string) { this.source = source; this.identity = identity; }
  async refresh() {
    const oldest = this.value?.items.at(-1);
    let page = await this.source({limit: 8});
    const items = [...page.items];
    // Rebuild the loaded range under a fresh insertion ceiling, including new records.
    // Following only the old cursor here would leave a gap when a new head page shifts.
    while (oldest && !items.some(item => this.identity(item) === this.identity(oldest)) && page.hasMore) {
      const next = await this.source({limit: 8, cursor: page.nextCursor!});
      page = {...next, snapshotSeq: Math.min(page.snapshotSeq, next.snapshotSeq)};
      items.push(...page.items);
    }
    this.value = {...page, items};
  }
  async more() {
    if (!this.value) return this.refresh();
    if (!this.value.hasMore) return;
    const next = await this.source({limit: 8, cursor: this.value.nextCursor!});
    this.value = {...next, snapshotSeq: Math.min(this.value.snapshotSeq, next.snapshotSeq), items: [...this.value.items, ...next.items]};
  }
}
export interface ThreadPagesView {
  history: DesktopPage<HistoryItem>;
  artifacts: DesktopPage<ArtifactView>;
  operations: ReadonlyMap<string, DesktopPage<OperationView>>;
}
export class ThreadPages {
  private history: LoadedRange<HistoryItem>;
  private artifacts: LoadedRange<ArtifactView>;
  private operations = new Map<string, LoadedRange<OperationView>>();
  private queue: Promise<unknown> = Promise.resolve();
  private cursor?: number;
  private api: Pick<DesktopApi, 'historyPage'|'artifactPage'|'operationPage'|'events'>; readonly threadId: string;
  constructor(api: Pick<DesktopApi, 'historyPage'|'artifactPage'|'operationPage'|'events'>, threadId: string) {
    this.api = api; this.threadId = threadId;
    this.history = new LoadedRange(page => api.historyPage(threadId, page), item => item.run.id);
    this.artifacts = new LoadedRange(page => api.artifactPage(threadId, page), item => item.id);
  }
  private serial(work: () => Promise<void>): Promise<ThreadPagesView> {
    const result = this.queue.then(async () => { await work(); return this.view(); });
    this.queue = result.catch(() => {}); return result;
  }
  view(): ThreadPagesView {
    if (!this.history.value || !this.artifacts.value) throw Error('pages_not_loaded');
    return {history: this.history.value, artifacts: this.artifacts.value,
      operations: new Map([...this.operations].flatMap(([id, range]) => range.value ? [[id, range.value] as const] : []))};
  }
  private async read() {
    await this.history.refresh(); await this.artifacts.refresh();
    await this.readOperations(true);
  }
  private async readOperations(refresh: boolean) {
    for (const item of this.history.value!.items) {
      let range = this.operations.get(item.run.id);
      if (!range) { range = new LoadedRange(page => this.api.operationPage(item.run.id, page), op => op.id); this.operations.set(item.run.id, range); }
      if (refresh || !range.value) await range.refresh();
    }
  }
  /** Reconnect starts a new page chain; retain how far the user has browsed. */
  refresh() { return this.serial(async () => {
    await this.read();
    this.cursor = Math.min(this.history.value!.snapshotSeq, this.artifacts.value!.snapshotSeq,
      ...[...this.operations.values()].map(range => range.value!.snapshotSeq));
  }); }
  poll() { return this.serial(async () => {
    if (this.cursor === undefined) throw Error('pages_not_loaded');
    const events = await this.api.events(this.threadId, this.cursor);
    if (events.length) {
      await this.read();
      // Advance only past delivered events. A later activity/page snapshot must not skip
      // the remainder of a 128-event batch. Next poll drains the next batch, without commands.
      this.cursor = events.at(-1)!.seq;
    }
  }); }
  more(kind: 'history'|'artifacts'|string) { return this.serial(async () => {
    if (kind === 'history') { await this.history.more(); await this.readOperations(false); }
    else if (kind === 'artifacts') await this.artifacts.more();
    else { const range = this.operations.get(kind); if (!range) throw Error('run_not_loaded'); await range.more(); }
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
