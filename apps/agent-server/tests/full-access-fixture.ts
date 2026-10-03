// SYNTHETIC Provider, real ProductCore/Pi/Worker; no Renderer-selected test plan.
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupShell } from './model-shell-fixture.ts';
import { WorkerSupervisor } from '../worker-supervisor.ts';
export function fullScenario() {
  const { f, model, plan, access } = setupShell('responses');
  const outside = realpathSync(mkdtempSync(join(tmpdir(),'full-external-')));
  const options = { stateDirectory:join(f.root,'state'),databaseDirectory:join(f.root,'host'),resources:f.resources,fullAccessRoots:()=>[f.root] };
  let supervisor = new WorkerSupervisor(f.core,options);
  supervisor.command({type:'runs.cancel',requestId:'discard-initial',runId:f.run});
  supervisor.command({type:'threads.permissions',requestId:'full-mode',threadId:f.thread,mode:'full',expectedRevision:0});
  const command={type:'runs.start',requestId:'full-run',threadId:f.thread,input:'SYNTHETIC full access',permissionRevision:1};
  const run=supervisor.command(command).id;
  return {f,model,plan,access,outside,run,command,options,get supervisor(){return supervisor;},
    reopen(){f.reopen();supervisor=new WorkerSupervisor(f.core,options);},
    async dispose(){await supervisor.close();await f.dispose();rmSync(outside,{recursive:true,force:true});} };
}
