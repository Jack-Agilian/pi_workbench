// Explicit no-model command driver of the reusable desktop host and real Pi Worker chain.
import { mkdirSync, mkdtempSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { DesktopHost } from '../desktop-host.ts';
import { repository } from '../worker-launcher.ts';
import { until } from './scenario.ts';
import type { Ack } from '../../../packages/app-contracts/index.ts';
import type { DesktopThread } from '../../../packages/app-contracts/desktop.ts';
const mode=process.argv[2];if(!['allow','deny','cancel','crash'].includes(mode!))throw new Error('invalid_shell_demo');
const output=join(repository,'.artifacts/shell-demos');mkdirSync(output,{recursive:true});const profile=mkdtempSync(join(output,mode+'-'));const host=new DesktopHost(profile);
let cleanup='unconfirmed';
try {
 const thread=host.request({type:'command',command:{type:'threads.create',requestId:'thread',workspaceId:'demo-workspace',title:'SYNTHETIC Shell '+mode}}) as Ack;
 const run=host.request({type:'command',command:{type:'runs.start',requestId:'run',threadId:thread.id,input:mode==='allow'||mode==='deny'?'/demo-shell':'/demo-shell-wait'}}) as Ack;
 const snapshot=()=>host.request({type:'thread',threadId:thread.id}) as DesktopThread;
 await until(()=>snapshot().operations.length===1,'approval');const op=snapshot().operations[0]!;
 host.request({type:'command',command:{type:'approvals.resolve',requestId:'decision',operationId:op.id,parametersDigest:op.parametersDigest,decision:mode==='deny'?'deny':'allow'}});
 if(mode==='cancel'||mode==='crash') {await until(()=>existsSync(join(profile,'workspace/shell-heartbeat.txt')),'active command');if(mode==='cancel')host.request({type:'command',command:{type:'runs.cancel',requestId:'cancel',runId:run.id}});else process.kill(host.supervisor.workerPid!,'SIGKILL');}
 await host.supervisor.completion;
 host.request({type:'recover'});
 console.log(JSON.stringify({synthetic:true,realModelCalls:0,mode,profile:relative(repository,profile),snapshot:snapshot()},null,2));
} finally {try{await host.close();cleanup='verified';}catch{cleanup='blocked';}console.log(JSON.stringify({cleanup,profile:relative(repository,profile)}));}
