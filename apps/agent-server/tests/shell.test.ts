import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { ProductCore } from '../core.ts';
import { WorkerSupervisor } from '../worker-supervisor.ts';
import type { ResourceSelection } from '../../../packages/app-contracts/worker-ipc.ts';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, statSync, mkdtempSync, realpathSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { until } from './scenario.ts';
import { parametersDigest } from '../../../packages/pi-adapter/controlled-tools.ts';
import { repository, sterileEnvironment } from '../worker-launcher.ts';
import { shellScenario } from './shell-scenario.ts';
const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const outcome = (f: ReturnType<typeof shellScenario>) => f.core.snapshot(f.thread).operations[0]?.shell?.outcome;
for (const decision of ['allow','deny'] as const) test(`shell ${decision}: one intent, one approval/claim, no Artifact required`, async () => {
  const f = shellScenario("printf '中文 😀\\n'; printf 'error channel\\n' >&2; printf once >> count.txt");
  try {
    assert.equal(f.supervisor.command(f.command).id, f.run); const done = f.launch(); void done.catch(() => {});
    const op = await f.approval(decision); assert.notEqual(op.parametersDigest, f.plan.parametersDigest);
    f.supervisor.command({ type: 'approvals.resolve', requestId: 'approval', operationId: op.id, parametersDigest: op.parametersDigest, decision });
    await done; const snap = f.core.snapshot(f.thread); assert.equal(snap.runs.length, 1); assert.equal(snap.artifacts.length, 0);
    assert.equal(snap.runs[0]!.state, decision === 'allow' ? 'completed' : 'failed');
    if (decision === 'allow') { assert.equal(readFileSync(join(f.cwd,'count.txt'),'utf8'),'once'); assert.equal(outcome(f)?.stdout,'中文 😀\n'); assert.equal(outcome(f)?.stderr,'error channel\n'); assert.equal(outcome(f)?.sideEffects,'possible'); }
    else { assert.equal(existsSync(join(f.cwd,'count.txt')),false); assert.equal(outcome(f),null); }
  } finally { await f.dispose(); }
});
test('shell nonzero exit preserves actual side effects and independent stdout/stderr', async () => {
  const f = shellScenario("printf changed > changed.txt; printf fail >&2; exit 7");
  try { const done=f.launch(); await f.approval(); await done; assert.equal(outcome(f)?.exitCode,7); assert.equal(outcome(f)?.sideEffects,'possible'); assert.equal(readFileSync(join(f.cwd,'changed.txt'),'utf8'),'changed'); assert.equal(f.core.snapshot(f.thread).runs[0]!.state,'failed'); } finally { await f.dispose(); }
});
for (const mode of ['cancel','timeout','worker-kill'] as const) test(`shell ${mode}: real separate group/child heartbeats cease; no side-effect replay`, async () => {
  const f=shellScenario("echo $$ > shell.pid; (while :; do printf . >> heartbeat; sleep 0.05; done) & echo $! > child.pid; wait",mode==='timeout'?700:10000);
  let done: Promise<void> | undefined;
  try {
    done=f.launch(); void done.catch(()=>{}); await f.approval(); await until(()=>existsSync(join(f.cwd,'heartbeat')),'shell started');
    const pid=Number(readFileSync(join(f.cwd,'shell.pid'),'utf8')); const child=Number(readFileSync(join(f.cwd,'child.pid'),'utf8')); assert.notEqual(pid,f.supervisor.workerPid); assert.equal(Number(execFileSync('/bin/ps',['-o','pgid=','-p',String(pid)],{encoding:'utf8'}).trim()),pid); assert.equal(Number(execFileSync('/bin/ps',['-o','pgid=','-p',String(child)],{encoding:'utf8'}).trim()),pid);
    if(mode==='cancel') f.supervisor.command({ type:'runs.cancel',requestId:'cancel',runId:f.run });
    if(mode==='worker-kill') process.kill(f.supervisor.workerPid!,'SIGKILL');
    await done; assert.throws(()=>process.kill(-pid,0)); assert.throws(()=>process.kill(child,0));
    const mtime=statSync(join(f.cwd,'heartbeat'),{bigint:true}).mtimeNs; await delay(100); assert.equal(statSync(join(f.cwd,'heartbeat'),{bigint:true}).mtimeNs,mtime);
    f.reopen();
    if(mode==='worker-kill') { assert.throws(()=>f.supervisor.recover(),/shell_side_effect_unresolved/); assert.equal(f.core.snapshot(f.thread).runs[0]!.state,'unknown'); f.supervisor.command({ type:'runs.start',requestId:'next',threadId:f.thread,input:'queued after unknown' }); assert.equal(f.launch(),undefined); }
    else { f.supervisor.recover(); assert.equal(f.core.snapshot(f.thread).runs[0]!.state,mode==='cancel'?'cancelled':'failed'); }
    assert.equal(statSync(join(f.cwd,'heartbeat'),{bigint:true}).mtimeNs,mtime);
  } finally { await done?.catch(()=>{}); await f.dispose(); }
});
test('shell output is bounded while draining UTF-8 and cancellation remains available', async () => {
  const f=shellScenario("i=0; while [ $i -lt 5000 ]; do printf '中文😀'; printf 'err' >&2; i=$((i+1)); done");
  try { const done=f.launch(); await f.approval(); await done; const out=outcome(f)!;assert.equal(out.truncated,true);assert.ok(Buffer.byteLength(out.stdout)<=4003);assert.ok(Buffer.byteLength(out.stderr)<=4003);assert.equal(f.core.snapshot(f.thread).runs[0]!.state,'completed'); } finally { await f.dispose(); }
});
test('shell cannot read/create host DB or resource/receipt paths and has no provider environment', async () => {
  const f=shellScenario('placeholder');
  const quote=(s:string)=>"'"+s.replaceAll("'","'\\''")+"'";
  const canary=join(f.root,'host','canary');writeFileSync(canary,'SYNTHETIC_HOST_CANARY'); symlinkSync(join(f.root,'host'),join(f.cwd,'.shell-home'));symlinkSync(join(f.root,'host'),join(f.cwd,'escape')); const receiptCanary=join(f.root,'state','receipt-canary');writeFileSync(receiptCanary,'SYNTHETIC_RECEIPT_CANARY');
  const sqliteCode=`const {DatabaseSync}=require('node:sqlite');new DatabaseSync('allowed.sqlite').close();let denied=0;for(const p of ${JSON.stringify([f.database,join(f.root,'host','new.sqlite')])}){try{new DatabaseSync(p).close()}catch{denied++}}if(denied!==2)process.exit(9);console.log('sqlite denied')`;
  const command=`test -z "\${OPENAI_API_KEY-}\${NODE_OPTIONS-}" && ! cat escape/canary && ! cat ${quote(canary)} && ! cat ${quote(receiptCanary)} && ! cat ${quote(join(f.resources.root,'package.json'))} && ${quote(process.execPath)} -e ${quote(sqliteCode)}`;
  f.plan.shell.command=command;f.plan.parametersDigest=parametersDigest({command,timeout:5});
  const priorKey=process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY='SYNTHETIC_PARENT_CREDENTIAL_CANARY';
  try { const done=f.supervisor.startNext(f.plan,{path:join(repository,'packages/pi-adapter/shell-demo-worker.ts'),args:[JSON.stringify({command,timeout:5})]})!;await f.approval();await done;assert.equal(outcome(f)?.exitCode,0);assert.match(outcome(f)!.stdout,/sqlite denied/);assert.equal(existsSync(join(f.root,'host','new.sqlite')),false);assert.equal(existsSync(join(f.root,'host','tmp')),false); } finally { if(priorKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=priorKey; await f.dispose(); }
});

for (const mode of ['host-kill','result-lost'] as const) test(`shell ${mode}: reopen real database; guardian survives host death, never replay`, async () => {
  const dir=realpathSync(mkdtempSync(join(tmpdir(),'shell-host-'))); const manifest=join(dir,'manifest.json');
  const child=spawn(process.execPath,[join(repository,'apps/agent-server/tests/shell-host-fixture.ts'),manifest,mode],{env:sterileEnvironment(dir),stdio:'ignore'});
  let exited=false; child.once('exit',()=>{exited=true;});
  let core: ProductCore | undefined; let root: string | undefined;
  try {
    await until(()=>existsSync(manifest),'host checkpoint');
    const record=JSON.parse(readFileSync(manifest,'utf8')) as {root:string;cwd:string;database:string;thread:string;run:string;resources:ResourceSelection;workerPid:number;guardianPid:number};root=record.root;
    child.kill('SIGKILL');await until(()=>exited,'host exited');
    const lease=join(root,'state/leases',readdirSync(join(root,'state/leases'))[0]!);
    await until(()=>existsSync(join(lease,'cleanup.json')),'cleanup receipt');
    const cleanup=JSON.parse(readFileSync(join(lease,'cleanup.json'),'utf8')) as {groupGone:boolean};assert.equal(cleanup.groupGone,true);
    const shell=JSON.parse(readFileSync(join(lease,'shell.json'),'utf8')) as {pid:number;groupGone:boolean};assert.equal(shell.groupGone,true);assert.throws(()=>process.kill(-shell.pid,0));
    await until(()=>{try{process.kill(record.guardianPid,0);return false;}catch{return true;}},'guardian exited');
    core=new ProductCore(record.database,[{id:'workspace',path:record.cwd}]);const supervisor=new WorkerSupervisor(core,{stateDirectory:join(root,'state'),databaseDirectory:join(root,'host'),resources:record.resources});
    if(mode==='host-kill') { assert.throws(()=>supervisor.recover(),/shell_side_effect_unresolved/);assert.equal(core.snapshot(record.thread).runs[0]!.state,'unknown');const before=statSync(join(record.cwd,'heartbeat'),{bigint:true}).mtimeNs;await delay(100);assert.equal(statSync(join(record.cwd,'heartbeat'),{bigint:true}).mtimeNs,before); }
    else {const target=join(record.cwd,'count.txt');const before=statSync(target,{bigint:true}).mtimeNs;supervisor.recover();supervisor.recover();assert.equal(core.snapshot(record.thread).operations[0]!.state,'succeeded');assert.equal(core.snapshot(record.thread).runs[0]!.state,'failed');assert.equal(readFileSync(target,'utf8'),'once');assert.equal(statSync(target,{bigint:true}).mtimeNs,before);}
    assert.equal(core.workerLaunches().length,1);
  } finally {if(!exited){child.kill('SIGKILL');await until(()=>exited,'fixture exit');}core?.close();if(root)rmSync(root,{recursive:true,force:true});rmSync(dir,{recursive:true,force:true});}
});

for(const mode of ['cancel-before-approval','expired','resource-changed'] as const) test(`shell ${mode}: no command starts`,async()=>{
 const f=shellScenario('printf forbidden > forbidden.txt');const done=f.launch();void done.catch(()=>{});
 try {
  await until(()=>f.core.snapshot(f.thread).operations.length===1,'pending');const op=f.core.snapshot(f.thread).operations[0]!;
  if(mode==='cancel-before-approval')f.supervisor.command({type:'runs.cancel',requestId:'cancel-early',runId:f.run});
  else if(mode==='resource-changed')writeFileSync(join(f.resources.root,'package.json'),'SYNTHETIC changed resource');
  // SYNTHETIC expiry of the durable approval, not a public product command.
  else { const db=new DatabaseSync(f.database); db.prepare('UPDATE operations SET deadline=? WHERE id=?').run(Date.now()-1,op.id); db.close(); }
  if(mode!=='resource-changed') assert.throws(()=>f.supervisor.command({type:'approvals.resolve',requestId:'late',operationId:op.id,parametersDigest:op.parametersDigest,decision:'allow'}));
  else f.supervisor.command({type:'approvals.resolve',requestId:'changed',operationId:op.id,parametersDigest:op.parametersDigest,decision:'allow'});
  await f.supervisor.close(); await done; assert.equal(existsSync(join(f.cwd,'forbidden.txt')),false);
 } finally { await f.dispose(); }
});
test('shell output flood stays bounded and active cancel cleans its actual group',async()=>{
 const f=shellScenario('echo $$ > shell.pid; while :; do printf "中文😀xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"; done',10000);const done=f.launch();void done.catch(()=>{});
 try{await f.approval();await until(()=>existsSync(join(f.cwd,'shell.pid')),'flood spawned');await delay(150);f.supervisor.command({type:'runs.cancel',requestId:'flood-cancel',runId:f.run});await done;f.supervisor.recover();assert.equal(f.core.snapshot(f.thread).runs[0]!.state,'cancelled');assert.equal(outcome(f)?.truncated,true);assert.ok(Buffer.byteLength(outcome(f)!.stdout)<=4003);assert.throws(()=>process.kill(-Number(readFileSync(join(f.cwd,'shell.pid'),'utf8')),0));}finally{await f.dispose();}
});
test('shell OS denies actual loopback listener; no network permission fallback',async()=>{
 const code="const s=require('node:net').createServer();s.on('error',e=>{if(e.code!=='EPERM'&&e.code!=='EACCES')process.exitCode=8;else console.log('network denied')});s.listen(0,'127.0.0.1',()=>{s.close();process.exitCode=9})";
 const quote=(s:string)=>"'"+s.replaceAll("'","'\\''")+"'";const f=shellScenario(`${quote(process.execPath)} -e ${quote(code)}`);
 try{const done=f.launch();await f.approval();await done;assert.equal(outcome(f)?.exitCode,0);assert.match(outcome(f)!.stdout,/network denied/);}finally{await f.dispose();}
});
for(const mode of ['shell-before-approval','shell-forged-result','old'] as const)test(`host rejects ${mode} from actual synthetic Worker channel`,async()=>{
 const f=shellScenario('printf forbidden > forbidden.txt');const path=join(repository,'apps/agent-server/tests/protocol-fixture.ts');
 try{await f.supervisor.startNext(f.plan,{path,extraRead:[path],args:[mode,f.plan.parametersDigest]});f.supervisor.recover();assert.equal(f.core.snapshot(f.thread).operations.length,0);assert.equal(existsSync(join(f.cwd,'forbidden.txt')),false);assert.equal(f.core.snapshot(f.thread).runs[0]!.state,'failed');}finally{await f.dispose();}
});
