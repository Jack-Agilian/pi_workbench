// Only SYNTHETIC keys and isolated, owned temporary files. No user credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, writeFileSync, chmodSync, symlinkSync, mkdirSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfiguredApiKey } from '../../packages/pi-adapter/model-credentials.ts';
import { HostClient } from './host-client.ts';
import { repository } from '../agent-server/worker-launcher.ts';
import type { DesktopHome } from '../../packages/app-contracts/desktop.ts';
const key='SYNTHETIC_STORED_KEY';
test('auth.json literal reader refuses unsafe file, expansion and malformed secret without echo',()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'credentials-test-')));const file=join(root,'auth.json');
 const save=(value:unknown)=>writeFileSync(file,JSON.stringify(value),{mode:0o600});
 try{
  save({openai:{type:'api_key',key}});assert.equal(readConfiguredApiKey(file,'openai',repository),key);assert.equal(readConfiguredApiKey(file,'anthropic',repository),undefined);
  assert.throws(()=>readConfiguredApiKey(file,'openai',root),/^Error: model_credentials_invalid$/);
  chmodSync(file,0o644);assert.throws(()=>readConfiguredApiKey(file,'openai',repository));chmodSync(file,0o600);
  const link=join(root,'link.json');symlinkSync(file,link);assert.throws(()=>readConfiguredApiKey(link,'openai',repository));
  const pi=join(root,'.pi');mkdirSync(pi);const other=join(pi,'auth.json');writeFileSync(other,readFileSync(file),{mode:0o600});assert.throws(()=>readConfiguredApiKey(other,'openai',repository));
  for(const credential of [{type:'api_key',key:'!touch should-never-exist'},{type:'api_key',key:'$SYNTHETIC_ENV'},{type:'oauth',key},{type:'api_key',key,command:'forbidden'}]){save({openai:credential});assert.throws(()=>readConfiguredApiKey(file,'openai',repository),/^Error: model_credentials_invalid$/);}
  save({openai:{type:'api_key',key:''}});assert.equal(readConfiguredApiKey(file,'openai',repository),undefined);
  writeFileSync(file,'{"'+key);assert.throws(()=>readConfiguredApiKey(file,'openai',repository),/^Error: model_credentials_invalid$/);
  writeFileSync(file,'x'.repeat(65537));assert.throws(()=>readConfiguredApiKey(file,'openai',repository));
  assert.deepEqual(readdirSync(root).sort(),['.pi','auth.json','link.json']);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('real Host startup and reconnect reload app-owned auth.json; invalid permissions fail closed',async()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'credentials-host-')));const config=join(root,'model.json');const auth=join(root,'auth.json');
 const policy={version:1,authorizationId:'synthetic-stored',approved:true,dataScope:'synthetic_non_sensitive',provider:'openai',model:'gpt-4o-mini',endpoint:'https://api.openai.com/v1',maxRequests:1,maxOutputTokens:64,timeoutMs:5000,maxEstimatedCostUsd:1};
 writeFileSync(config,JSON.stringify(policy));writeFileSync(auth,JSON.stringify({openai:{type:'api_key',key}}),{mode:0o600});
 const client=new HostClient(process.execPath,repository,join(root,'host'),'--model',config,true);
 try{
  await client.connect();
  for(let n=0;n<2;n++){if(n)await client.reconnect();const home=await client.request({type:'home'}) as DesktopHome;assert.equal(home.model?.status,'ready');assert.equal(JSON.stringify(home).includes(key),false);}
  chmodSync(auth,0o644);await client.reconnect();assert.equal((await client.request({type:'home'}) as DesktopHome).model?.status,'key_required');
  assert.equal(readFileSync(join(root,'host','host','product.sqlite')).includes(Buffer.from(key)),false);
  chmodSync(auth,0o600);writeFileSync(config,JSON.stringify({...policy,approved:false}));await client.reconnect();assert.equal((await client.request({type:'home'}) as DesktopHome).model?.status,'not_configured');
 }finally{await client.close();rmSync(root,{recursive:true,force:true});}
});
