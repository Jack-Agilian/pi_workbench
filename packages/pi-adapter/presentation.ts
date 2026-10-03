import type { SessionEntry } from '@earendil-works/pi-coding-agent';
import { displayText, type Presentation } from '../app-contracts/presentation.ts';
/** Public native entries -> bounded plain text. No thinking, raw tool arguments/results or errors; failed tools receive fixed text. */
export function projectMessages(entries: readonly SessionEntry[]): Presentation {
  const result: Presentation = { messages: [], omitted: false }; let remaining = 8000;
  for (const entry of entries) {
    if (entry.type !== 'message')continue;
    if(entry.message.role==='toolResult'){
      if(entry.message.isError){
        const name=['read','write','edit','bash'].includes(entry.message.toolName)?entry.message.toolName:'工具';
        const text=`${name} 调用未成功；模型回复不代表操作已执行，成果以核验记录为准。`;
        if(result.messages.length<16 && remaining>=text.length){result.messages.push({id:entry.id,role:'tool',text,truncated:false});remaining-=text.length;}else result.omitted=true;
      }
      continue;
    }
    if(entry.message.role !== 'user' && entry.message.role !== 'assistant')continue;
    const content = entry.message.content;
    const body = typeof content === 'string' ? content : content.filter(c => c.type === 'text').map(c => c.text).join('\n');
    if (!body) continue;
    if (result.messages.length === 16 || !remaining) { result.omitted = true; continue; }
    const text = displayText(body, Math.min(2048, remaining)); remaining -= text.length;
    result.messages.push({ id: entry.id, role: entry.message.role, text, truncated: body.length > text.length });
  }
  return result;
}
