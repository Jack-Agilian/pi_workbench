import { contextBridge, ipcRenderer } from 'electron';
import type { Ack, Command, ProductEvent } from '../../packages/app-contracts/index.ts';
import type { DesktopApi, DesktopHome, DesktopReply, DesktopRequest, DesktopThread, Preview } from '../../packages/app-contracts/desktop.ts';
async function request<T>(payload: DesktopRequest): Promise<T> {
  const reply: DesktopReply = await ipcRenderer.invoke('workbench:request', payload);
  if (!reply.ok) throw new Error(reply.code);
  return reply.value as T;
}
const api: DesktopApi = {
  home: () => request<DesktopHome>({ type: 'home' }),
  thread: threadId => request<DesktopThread>({ type: 'thread', threadId }),
  events: (threadId, cursor) => request<ProductEvent[]>({ type: 'events', threadId, cursor }),
  command: (command: Command) => request<Ack>({ type: 'command', command }),
  preview: artifactId => request<Preview>({ type: 'preview', artifactId }),
  recover: () => request<DesktopHome>({ type: 'recover' }),
  reconnect: async () => { const ok: boolean = await ipcRenderer.invoke('workbench:reconnect'); if (!ok) throw new Error('disconnected'); },
};
contextBridge.exposeInMainWorld('workbench', Object.freeze(api));
