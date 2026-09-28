import './check-environment.mjs';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { sterileEnvironment, repository, launchSpec } from '../apps/agent-server/worker-launcher.ts';
import { ModelHttp } from '../apps/agent-server/model-http.ts';
import { modelFetch } from '../packages/pi-adapter/model-fetch.ts';
if(process.platform!=='darwin')throw new Error('model_network_platform_not_verified');
if(!process.argv.includes('--sterile-child')){
 const root=realpathSync(mkdtempSync(join(tmpdir(),'m1-network-launch-')));
 try{const result=spawnSync(process.execPath,[join(repository,'scripts/test-model-network.mjs'),'--sterile-child'],{cwd:root,env:sterileEnvironment(root),stdio:'inherit',timeout:30000});if(result.error||result.signal)throw new Error('network_test_terminated');process.exitCode=result.status??1;}finally{rmSync(root,{recursive:true,force:true});}
}else{
 // Only this test process has local networking. No real Provider URL or credential is used.
 let received=0;let redirected=0;
 const server=createServer((req,res)=>{received++;if(req.url==='/redirect'){res.writeHead(307,{location:'/not-approved'});res.end();}else if(req.url==='/not-approved'){redirected++;res.end('must not arrive');}else{res.writeHead(200,{'content-type':'text/event-stream'});res.end('SYNTHETIC LOOPBACK ONLY');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=server.address().port;const base='http://127.0.0.1:'+port;
 try{
  for(const path of ['/stream','/redirect']){
   let reserves=0;const host=new ModelHttp(base+path,()=>reserves++);
   const worker=modelFetch(async(body,id)=>host.receive(body,async(reply)=>{worker.receive(id,reply);}));
   try{const response=worker.fetch(base+path,{method:'POST',body:'{}'});if(path==='/redirect')await assert.rejects(response,/transport_failed/);else assert.equal(await(await response).text(),'SYNTHETIC LOOPBACK ONLY');assert.equal(reserves,1);}finally{worker.close();await host.close();}
  }
  assert.equal(received,2);assert.equal(redirected,0);
  const {createScenario}=await import('../apps/agent-server/tests/scenario.ts');const f=createScenario();
  try{
   const lease=join(f.root,'isolation-lease');const agentDir=join(f.root,'isolated-agent');const sessions=join(f.root,'isolated-sessions');for(const path of [lease,agentDir,sessions])mkdirSync(path);
   const binding=f.core.dispatchNext();const entry=join(repository,'apps/agent-server/tests/model-isolation-fixture.ts');
   const spec=launchSpec({binding,workspace:f.cwd,agentDir,sessions,resources:f.resources,deadline:Date.now()+10000},{instanceId:'fixed-test',nonce:'fixed-test'},{lease,databaseDirectory:join(f.root,'host')},{path:entry,extraRead:[entry],args:[f.database,String(port)]});
   // Remove the JS network tripwire ONLY from this fixed test launch: denial must come from OS policy.
   const args=[...spec.args];const index=args.indexOf('--import');assert.notEqual(index,-1);args.splice(index,2);
   const child=spawn(spec.executable,args,{cwd:spec.cwd,env:spec.env,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
   const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve(signal??code));});assert.equal(code,0,output);assert.equal(existsSync(f.database+'.worker-created'),false);assert.equal(received,2);
  }finally{await f.dispose();}
  console.log('model transport: actual loopback fetch, redirect rejection, OS Worker SQLite/network denial passed; realModelCalls=0');
 }finally{await new Promise(resolve=>server.close(resolve));}
}
