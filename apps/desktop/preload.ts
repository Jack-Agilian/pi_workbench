import type { NativeTextPage } from '../../packages/app-contracts/native-text.ts';
import type { HistoryPage, HistoryEntry, OperationPage, ArtifactPage, ThreadActivity } from '../../packages/app-contracts/desktop-pages.ts';
import { contextBridge, ipcRenderer } from 'electron';
import type { Ack, Command, ProductEvent } from '../../packages/app-contracts/index.ts';
import type { DesktopApi, DesktopHome, DesktopReply, DesktopRequest, DesktopThread, Preview } from '../../packages/app-contracts/desktop.ts';
async function request<T>(payload: DesktopRequest, queryScope?: string): Promise<T> {
  const reply: DesktopReply = await ipcRenderer.invoke('workbench:request', payload, queryScope);
  if (!reply.ok) throw new Error(reply.code);
  return reply.value as T;
}
const api: DesktopApi = {
  queryScope: async () => {
    const scope: unknown = await ipcRenderer.invoke('workbench:query-scope');
    if (typeof scope !== 'string') throw Error('disconnected');
    return scope;
  },
  nativeText:(threadId,runId,cursor,queryScope)=>request<NativeTextPage>({type:'native-text',threadId,runId,...(cursor?{cursor}:{})},queryScope),
  historyEntry:(threadId,runId)=>request<HistoryEntry>({type:'history-entry',threadId,runId}),
  historyPage:(threadId,page)=>request<HistoryPage>({type:'history-page',threadId,...(page?{page}:{})}),
  operationPage:(runId,page,queryScope)=>request<OperationPage>({type:'operation-page',runId,...(page?{page}:{})},queryScope),
  artifactPage:(threadId,page)=>request<ArtifactPage>({type:'artifact-page',threadId,...(page?{page}:{})}),
  threadActivity:threadId=>request<ThreadActivity>({type:'thread-activity',threadId}),
  selectWorkspace: async () => { if(!await ipcRenderer.invoke('workbench:workspace'))throw new Error('workspace_rejected'); },
  selectModelCredential: async () => { if(!await ipcRenderer.invoke('workbench:credential'))throw new Error('credential_rejected'); },
  home: () => request<DesktopHome>({ type: 'home' }),
  thread: threadId => request<DesktopThread>({ type: 'thread', threadId }),
  events: (threadId, cursor) => request<ProductEvent[]>({ type: 'events', threadId, cursor }),
  command: (command: Command) => request<Ack>({ type: 'command', command }),
  preview: artifactId => request<Preview>({ type: 'preview', artifactId }),
  recover: () => request<DesktopHome>({ type: 'recover' }),
  reconnect: async () => { const ok: boolean = await ipcRenderer.invoke('workbench:reconnect'); if (!ok) throw new Error('disconnected'); },
};
contextBridge.exposeInMainWorld('workbench', Object.freeze(api));
