import { parseSessionEntries, SessionManager } from '@earendil-works/pi-coding-agent';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { displayText } from '../app-contracts/presentation.ts';
import type { NativeTextChunk, NativeTextPage, NativeTextSource } from '../app-contracts/native-text.ts';
import { exact } from '../app-contracts/worker-ipc.ts';

const MAX_SESSION_BYTES=8*1024*1024, PAGE_BYTES=16*1024;
/** Public parser + in-memory manager: never SessionManager.open, which can migrate
 * a file. No session construction, extension discovery, credentials or providers. */
export function readNativeText(source:NativeTextSource, directory:string, cwd:string, runId:string, cursor?:string):NativeTextPage {
  if(!source.finished)return {status:'pending'};
  let fd:number|undefined;
  try {
    if(realpathSync(directory)!==directory||dirname(source.reference)!==directory||!source.reference.endsWith('.jsonl'))return {status:'unavailable'};
    const lst=lstatSync(source.reference);
    if(!lst.isFile()||lst.isSymbolicLink()||lst.nlink!==1||realpathSync(source.reference)!==source.reference)return {status:'unavailable'};
    if(lst.size>MAX_SESSION_BYTES)return {status:'too_large'};
    fd=openSync(source.reference,constants.O_RDONLY|constants.O_NOFOLLOW);
    const before=fstatSync(fd);if(before.dev!==lst.dev||before.ino!==lst.ino)return {status:'changed'};
    const buffer=Buffer.alloc(MAX_SESSION_BYTES+1);let count=0,read=0;
    do {read=readSync(fd,buffer,count,buffer.length-count,null);count+=read;} while(read>0&&count<buffer.length);
    const bytes=buffer.subarray(0,count);const after=fstatSync(fd);
    if(bytes.length>MAX_SESSION_BYTES)return {status:'too_large'};
    if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs)return {status:'changed'};
    const entries=parseSessionEntries(bytes.toString('utf8'));
    const header=entries[0];if(!header||header.type!=='session'||header.cwd!==cwd)return {status:'unavailable'};
    const ids=new Set<string>();
    for(const e of entries.slice(1)){if(e.type==='session'||ids.has(e.id)||(e.parentId!==null&&!ids.has(e.parentId)))return {status:'unavailable'};ids.add(e.id);}
    const manager=SessionManager.inMemory(cwd,undefined,entries);
    if(source.end!==null&&!manager.getEntry(source.end))return {status:'unavailable'};
    const branch=source.end===null?[]:manager.getBranch(source.end);
    const start=source.start===null?-1:branch.findIndex(e=>e.id===source.start);
    if(source.start!==null&&start<0)return {status:'unavailable'};
    const range=branch.slice(start+1);
    let filtered=false;
    const messages:Omit<NativeTextChunk,'offset'|'end'>[]=[];
    for(const entry of range){
      if(entry.type!=='message'){filtered=true;continue;}
      const message=entry.message;
      if(message.role==='toolResult'){
        filtered=true;
        if(message.isError){const name=['read','write','edit','bash'].includes(message.toolName)?message.toolName:'工具';messages.push({id:entry.id,role:'tool',text:`${name} 调用未成功；模型回复不代表操作已执行，成果以核验记录为准。`,redacted:false});}
        continue;
      }
      if(message.role!=='user'&&message.role!=='assistant'){filtered=true;continue;}
      const body=typeof message.content==='string'?message.content:message.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
      if(typeof message.content!=='string'&&message.content.some(c=>c.type!=='text'))filtered=true;
      if(!body)continue;
      // Redact the whole message before splitting, so tokens spanning page boundaries
      // cannot be reconstructed by joining individually filtered pieces.
      const text=displayText(body,body.length);messages.push({id:entry.id,role:message.role,text,redacted:text!==body});
    }
    const hash=createHash('sha256').update(JSON.stringify({runId,start:source.start,end:source.end,range,filtered})).digest('hex');
    let index=0,offset=0;
    if(cursor){
      const c=exact(JSON.parse(Buffer.from(cursor,'base64url').toString('utf8')),['runId','hash','index','offset']);
      if(c.runId!==runId||c.hash!==hash)return {status:'changed'};
      if(!Number.isSafeInteger(c.index)||!Number.isSafeInteger(c.offset)||Number(c.index)<0||Number(c.index)>=messages.length||Number(c.offset)<0||Number(c.offset)>=messages[Number(c.index)]!.text.length)return {status:'unavailable'};
      index=Number(c.index);offset=Number(c.offset);
      if(offset>0&&/[\uDC00-\uDFFF]/.test(messages[index]!.text[offset]!)&&/[\uD800-\uDBFF]/.test(messages[index]!.text[offset-1]!))return {status:'unavailable'};
    }
    const chunks:NativeTextChunk[]=[];let remaining=PAGE_BYTES;
    while(index<messages.length&&chunks.length<16&&remaining>0){
      const m=messages[index]!;let text='',used=0;
      for(const cp of m.text.slice(offset)){const size=Buffer.byteLength(cp);if(used+size>remaining)break;text+=cp;used+=size;}
      if(!text&&m.text.length>offset)break;
      const end=offset+text.length===m.text.length;
      chunks.push({...m,text,offset,end});remaining-=used;
      if(end){index++;offset=0;}else offset+=text.length;
    }
    return {status:'ready',chunks,filtered,nextCursor:index===messages.length?null:Buffer.from(JSON.stringify({runId,hash,index,offset})).toString('base64url')};
  }catch(error){return {status:error instanceof Error&&'code'in error&&error.code==='ENOENT'?'missing':'unavailable'};}
  finally{if(fd!==undefined)closeSync(fd);}
}
