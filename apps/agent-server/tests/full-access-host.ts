// SYNTHETIC full-mode host checkpoint; actual ProductCore, Worker, Pi tools and guardian.
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fullScenario } from './full-access-fixture.ts';
import { syntheticReply } from './file-agent-fixture.ts';
import { until } from './scenario.ts';
import { repository } from '../worker-launcher.ts';
const x=fullScenario(),{f}=x;
const path=join(repository,'apps/agent-server/tests/file-agent-worker.ts');
void x.supervisor.startNext(x.plan,{path,extraRead:[path],args:['after-write']},{...x.access,fetch:async()=>new Response(syntheticReply('responses',1,[{tool:'write',parameters:{path:join(x.outside,'lost.txt'),content:'SYNTHETIC host killed'}}]),{headers:{'content-type':'text/event-stream'}})})?.catch(()=>{});
await until(()=>existsSync(join(f.cwd,'.file-agent-stage')),'full host external write');
writeFileSync(process.argv[2]!,JSON.stringify({root:f.root,outside:x.outside,database:f.database,cwd:f.cwd,thread:f.thread,run:x.run,resources:f.resources}));
setInterval(()=>{},1000);
