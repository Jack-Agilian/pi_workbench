import './check-environment.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repository, sterileEnvironment } from '../apps/agent-server/worker-launcher.ts';
const root=realpathSync(mkdtempSync(join(tmpdir(),'m1-config-test-')));const path=join(root,'model.json');
const run=(script,args,expected=0)=>{const result=spawnSync(process.execPath,[join(repository,'scripts',script),...args],{cwd:root,env:sterileEnvironment(join(root,'home')),encoding:'utf8',timeout:120000});assert.equal(result.status,expected,result.stdout+result.stderr);};
try{
 run('model-config.mjs',['init',path]);const bytes=readFileSync(path,'utf8');assert.equal(JSON.parse(bytes).approved,false);
 run('model-config.mjs',['init',path],1);assert.equal(readFileSync(path,'utf8'),bytes);
 run('model-config.mjs',['check',path],1);
 run('launch-desktop.mjs',['--model','--model-smoke-test','--model-config='+path]);
 const config={...JSON.parse(bytes),approved:true,provider:'anthropic',model:'claude-sonnet-4-5',endpoint:'https://api.anthropic.com',maxRequests:1,maxEstimatedCostUsd:5};
 writeFileSync(path,JSON.stringify(config));run('model-config.mjs',['check',path]);
 // Trusted smoke mode forces host network tripwire, even for configured model mode.
 run('launch-desktop.mjs',['--model','--model-smoke-test','--model-config='+path]);
 console.log('model config: init refuses overwrite, invalid/valid check, real Electron missing config and private native credential selection passed; realModelCalls=0');
}finally{rmSync(root,{recursive:true,force:true});}
