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
 run('model-config.mjs',['init',path]);const bytes=readFileSync(path,'utf8');assert.equal(JSON.parse(bytes).approved,false);assert.equal(Object.hasOwn(JSON.parse(bytes),'maxRequests'),false);assert.equal(Object.hasOwn(JSON.parse(bytes),'maxEstimatedCostUsd'),false);assert.equal(Object.hasOwn(JSON.parse(bytes),'maxOutputTokens'),false);
 run('model-config.mjs',['init',path],1);assert.equal(readFileSync(path,'utf8'),bytes);
 run('model-config.mjs',['check',path],1);
 run('launch-desktop.mjs',['--model','--model-smoke-test','--model-config='+path]);
 const config={...JSON.parse(bytes),approved:true,provider:'anthropic',model:'claude-sonnet-4-5',endpoint:'https://api.anthropic.com',maxRequests:1,maxEstimatedCostUsd:5};
 writeFileSync(path,JSON.stringify({...config,maxRequests:null}));run('model-config.mjs',['check',path]);
 // Trusted smoke mode forces host network tripwire, even for configured model mode.
 run('launch-desktop.mjs',['--model','--model-smoke-test','--model-config='+path]);
 // Persistent Pi-shaped auth.json and both OpenAI template modes, with network denied.
 const auth=join(root,'auth.json');run('model-config.mjs',['init-auth',auth]);
 const empty=readFileSync(auth,'utf8');run('model-config.mjs',['init-auth',auth],1);assert.equal(readFileSync(auth,'utf8'),empty);
 writeFileSync(auth,JSON.stringify({openai:{type:'api_key',key:'SYNTHETIC_STORED_KEY'}}));
 const official=join(root,'official.json');run('model-config.mjs',['init-openai',official]);
 writeFileSync(path,JSON.stringify({...config,provider:'openai',model:'gpt-4o-mini',endpoint:'https://api.openai.com/v1'}));
 run('model-config.mjs',['check',path]);run('launch-desktop.mjs',['--model','--model-smoke-test','--model-config='+path]);
 const compatible=join(root,'compatible.json');run('model-config.mjs',['init-compatible',compatible]);run('model-config.mjs',['check',compatible],1);
 const template=JSON.parse(readFileSync(compatible,'utf8'));
 writeFileSync(compatible,JSON.stringify({...template,model:'SYNTHETIC-custom',endpoint:'https://synthetic.example.invalid/v1',openai:{...template.openai,maxTokens:8192,contextWindow:8192,inputUsdPerMillion:0.2,outputUsdPerMillion:0.4}}));run('model-config.mjs',['check',compatible]);
 console.log('model config: repeat init refuses overwrite, official/compatible metadata checks, native temporary key and persistent auth.json startup/reconnect in actual Electron passed; realModelCalls=0');
}finally{rmSync(root,{recursive:true,force:true});}
