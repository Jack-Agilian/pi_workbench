// Trusted synthetic fault checkpoint in an actual App Server process.
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { shellScenario } from './shell-scenario.ts';
import { until } from './scenario.ts';
const [manifest, mode] = process.argv.slice(2);
const f = shellScenario(mode === 'result-lost' ? 'printf once >> count.txt; printf finished' : 'echo $$ > shell.pid; (while :; do printf . >> heartbeat; sleep 0.05; done) & echo $! > child.pid; wait', 10000);
const checkpoint = () => {
  writeFileSync(manifest!, JSON.stringify({ root:f.root, cwd:f.cwd, database:f.database, thread:f.thread, run:f.run, resources:f.resources, workerPid:f.supervisor.workerPid, guardianPid:f.supervisor.guardianPid }),{mode:0o600});
  process.kill(process.pid,'SIGSTOP');
};
if (mode === 'result-lost') f.core.subscribe(f.thread,0,event=>{if(event.kind==='shell.outcome')checkpoint();});
void f.launch().catch(()=>{}); await f.approval();
if(mode !== 'result-lost') { await until(()=>existsSync(join(f.cwd,'heartbeat')),'active_shell'); checkpoint(); }
setInterval(()=>{},1000);
