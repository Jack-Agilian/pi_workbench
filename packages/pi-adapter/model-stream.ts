import type { AgentSession, AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import { displayText, type Presentation } from '../app-contracts/presentation.ts';
import { projectMessages } from './presentation.ts';
/** Coalesced bounded display snapshots. Native Pi history remains authoritative. */
export function modelStream(session: AgentSession, prior: Set<string>, send: (value: Presentation) => Promise<void>) {
  let partial = ''; let dirty = false; let count = 0; let sending = Promise.resolve(); let closed = false;
  const snapshot = () => {
    const value = projectMessages(session.sessionManager.getBranch().filter(e => !prior.has(e.id)));
    if(partial){
      if(value.messages.length===16){value.messages.pop();value.omitted=true;}
      const remaining=8000-value.messages.reduce((n,m)=>n+m.text.length,0);
      if(remaining>0)value.messages.push({id:'streaming',role:'assistant',text:displayText(partial,Math.min(2048,remaining)),truncated:partial.length>Math.min(2048,remaining)});
      else value.omitted=true;
    }
    return value;
  };
  const flush = () => { if(closed || !dirty || count>=60)return; dirty=false;count++; const value=snapshot(); sending=sending.then(()=>send(value)); void sending.catch(()=>{}); };
  const timer=setInterval(flush,150);
  return {
    observe(event: AgentSessionEvent) { if((event.type==='message_start'||event.type==='message_end')&&event.message.role==='assistant'){partial='';dirty=true;} if(event.type==='message_update' && event.message.role==='assistant') { partial=event.message.content.filter(c=>c.type==='text').map(c=>c.text).join('\n').slice(0,2049); dirty=true; } },
    async finish() {clearInterval(timer);await sending; if(!closed)await send(projectMessages(session.sessionManager.getBranch().filter(e=>!prior.has(e.id))));},
    close() {closed=true;clearInterval(timer);},
  };
}
