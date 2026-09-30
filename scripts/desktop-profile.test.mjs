import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync,mkdtempSync,realpathSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { desktopProfile } from './desktop-profile.mjs';
import { HostClient } from '../apps/desktop/host-client.ts';
import { repository } from '../apps/agent-server/worker-launcher.ts';
test('development profile names are local/offline only; production defaults stay stable',()=>{
 const options={root:'/synthetic/tree',home:'/synthetic/home',mode:'--model-shell-offline'};
 for(const name of ['../escape','/tmp/escape','','A','a'.repeat(49)])assert.throws(()=>desktopProfile({...options,developmentName:name}));
 assert.throws(()=>desktopProfile({...options,mode:'--model',developmentName:'backend'}));
 assert.equal(desktopProfile({...options,developmentName:'backend'}),'/synthetic/tree/.artifacts/desktop-profiles/backend');
 assert.notEqual(desktopProfile({...options,developmentName:'frontend'}),desktopProfile({...options,developmentName:'backend'}));
 assert.equal(desktopProfile(options),'/synthetic/home/Library/Application Support/Pi Workbench/offline-shell-profile');
});
test('two simultaneous real offline hosts keep product databases and Thread identity isolated',async()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'parallel-profiles-')));
 const profiles=['frontend','backend'].map(developmentName=>desktopProfile({root,home:join(root,'unused-home'),mode:'--model-shell-offline',developmentName}));
 for(const p of profiles)mkdirSync(p,{recursive:true});
 const clients=profiles.map(p=>new HostClient(process.execPath,repository,p,'--model-shell-offline'));
 try{
  await Promise.all(clients.map(c=>c.connect()));assert.notEqual(clients[0].processId,clients[1].processId);
  for(const [i,c] of clients.entries())await c.request({type:'command',command:{type:'threads.create',requestId:'same-request',workspaceId:'demo-workspace',title:'SYNTHETIC profile '+i}});
  const homes=await Promise.all(clients.map(c=>c.request({type:'home'})));assert.equal(homes[0].threads.length,1);assert.equal(homes[1].threads.length,1);assert.notEqual(homes[0].threads[0].id,homes[1].threads[0].id);
  for(const [i,c] of clients.entries()){await c.reconnect();const home=await c.request({type:'home'});assert.equal(home.threads[0].title,'SYNTHETIC profile '+i);}
 }finally{await Promise.all(clients.map(c=>c.close()));rmSync(root,{recursive:true,force:true});}
});
