import type { AgentSession, AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import { displayText, type Presentation } from '../app-contracts/presentation.ts';
import { projectMessages } from './presentation.ts';
/** Coalesced bounded display snapshots. Native Pi history remains authoritative. */
export function modelStream(session: AgentSession, prior: Set<string>, send: (value: Presentation) => Promise<void>) {
  let partial = ''; let dirty = false; let count = 0; let sending = Promise.resolve(); let closed = false;
  const snapshot = () => {
    const value = projectMessages(session.sessionManager.getBranch().filter(e => !prior.has(e.id)));
    if(partial && !value.messages.some(m=>m.role==='assistant'))value.messages.push({id:'streaming',role:'assistant',text:displayText(partial),truncated:partial.length>2048});
    return value;
  };
  const flush = () => { if(closed || !dirty || count>=60)return; dirty=false;count++; const value=snapshot(); sending=sending.then(()=>send(value)); void sending.catch(()=>{}); };
  const timer=setInterval(flush,150);
  return {
    observe(event: AgentSessionEvent) { if(event.type==='message_update' && event.message.role==='assistant') { partial=event.message.content.filter(c=>c.type==='text').map(c=>c.text).join('\n').slice(0,2049); dirty=true; } },
    async finish() {clearInterval(timer);await sending; if(!closed)await send(projectMessages(session.sessionManager.getBranch().filter(e=>!prior.has(e.id))));},
    close() {closed=true;clearInterval(timer);},
  };
}
