// SYNTHETIC fault composition. Real host SIGKILL; no fault knobs in product IPC.
import { writeFileSync } from 'node:fs';
import { setupShell, approveShell, entry } from './model-shell-fixture.ts';
import { syntheticReply } from './file-agent-fixture.ts';
const {f,access,plan}=setupShell();const phase=process.argv[3]!;
function checkpoint(){writeFileSync(process.argv[2]!,JSON.stringify({root:f.root,cwd:f.cwd,database:f.database,thread:f.thread,resources:f.resources,workerPid:f.supervisor.workerPid}));process.kill(process.pid,'SIGKILL');}
if(phase==='launch')f.core.subscribe(f.thread,0,event=>{if(event.kind==='shell.launch')checkpoint();});
if(phase==='result')f.core.recordShellOutcome=()=>checkpoint();
void f.supervisor.startNext(plan,entry,{...access,fetch:async()=>new Response(syntheticReply('chat-completions',1,[{tool:'bash',parameters:{command:'printf once >> effect.txt'}}]),{headers:{'content-type':'text/event-stream'}})});
if(phase==='approval'){
 const {until}=await import('./scenario.ts');await until(()=>f.core.snapshot(f.thread).operations.length>0,'approval');checkpoint();
}else await approveShell(f);
