import { QueryClient } from '@tanstack/react-query';
import type { DesktopApi } from '../../packages/app-contracts/desktop.ts';
import type { OperationPage } from '../../packages/app-contracts/desktop-pages.ts';

export type OperationKey = readonly [string, string, 'operations', string, number, string | null];
/** Query owns tool data/status. ThreadPages retains only keys for its atomic display barrier.
 * A new batch gets immutable keys: successful individual reads cannot alter the published batch.
 */
export class OperationQueries {
  readonly client = new QueryClient({defaultOptions: {queries: {
    networkMode: 'always', staleTime: Infinity, gcTime: Infinity,
    retry: false, retryOnMount: false, refetchOnMount: false,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
  }}});
  private readonly api: Pick<DesktopApi, 'operationPage'>;
  private readonly scope: string; private readonly threadId: string;
  constructor(api: Pick<DesktopApi, 'operationPage'>, scope: string, threadId: string) {
    this.api = api; this.scope = scope; this.threadId = threadId;
  }
  key(runId: string, batch: number, cursor: string | null = null): OperationKey {
    return [this.scope, this.threadId, 'operations', runId, batch, cursor];
  }
  page(key: OperationKey): OperationPage {
    const page = this.client.getQueryData<OperationPage>(key);
    if (!page) throw Error('pages_not_loaded');
    return page;
  }
  subscribe = (listener: () => void) => this.client.getQueryCache().subscribe(listener);
  busy = () => this.client.isFetching() > 0;
  error = () => this.client.getQueryCache().getAll().find(q => q.state.status === 'error')?.state.error?.message ?? '';
  /** Cursor chaining is product-specific; concurrent reads of the same range share Query's promise. */
  async read(key: OperationKey, previous: OperationKey | undefined, more: boolean, check: () => void, resumeAt?: string): Promise<void> {
    const old = previous ? this.page(previous) : undefined;
    await this.client.query({queryKey: key, queryFn: async ({signal}) => {
      const guard = () => { check(); if (signal.aborted) throw Error('pages_cancelled'); };
      const fetch = async (cursor?: string) => {
        guard(); const page = await this.api.operationPage(key[3], {limit: 8, ...(cursor ? {cursor} : {})}, this.scope); guard(); return page;
      };
      if (more && old) {
        if (!old.hasMore) return old;
        const next = await fetch(old.nextCursor!);
        return {...next, snapshotSeq: Math.min(old.snapshotSeq, next.snapshotSeq), items: [...old.items, ...next.items]};
      }
      const oldest = old?.items.at(-1)?.id ?? resumeAt;
      let page = await fetch(); const items = [...page.items];
      while (oldest && !items.some(op => op.id === oldest) && page.hasMore) {
        const next = await fetch(page.nextCursor!);
        page = {...next, snapshotSeq: Math.min(page.snapshotSeq, next.snapshotSeq)}; items.push(...next.items);
      }
      return {...page, items};
    }});
    check();
  }
  /** Retain published keys only after atomic commit. Failed attempts retain Query's error for retry UI. */
  retain(keys: Iterable<OperationKey>) {
    const keep = new Set([...keys].map(key => JSON.stringify(key)));
    this.client.removeQueries({predicate: query => !keep.has(JSON.stringify(query.queryKey))});
  }
  cancel() { void this.client.cancelQueries(); }
  dispose() { this.client.clear(); }
}
