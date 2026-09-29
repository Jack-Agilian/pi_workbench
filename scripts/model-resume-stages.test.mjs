import test from 'node:test';
import assert from 'node:assert/strict';
import { resumeStages } from './model-resume-stages.mjs';
// Explicit synthetic product replies: no SDK fixture and no network.
for(const mode of ['normal','failed','fast-complete','unknown'])test(`resume stages ${mode}: exact old Thread, no first replay, stop on failure`,async()=>{
 const commands=[],saved=[];let stage='',cancelled=false;
 const client={async request(req){
  if(req.type==='command'){
   commands.push(req.command);
   if(req.command.type==='runs.cancel'){cancelled=true;return {id:stage};}
   assert.equal(req.command.threadId,'original-thread');assert.equal(commands.filter(c=>c.type==='runs.start').length<=2,true);
   stage=req.command.requestId.endsWith('-resume')?'resume':'cancel';return {id:stage};
  }
  assert.equal(req.threadId,'original-thread');
  const state=stage==='resume'?(mode==='failed'?'failed':mode==='unknown'?'unknown':'completed'):mode==='fast-complete'?'completed':cancelled?'cancelled':'running';
  return {runs:[{id:stage,state}],presentations:[{runId:stage,value:{messages:[{role:'assistant',text:stage==='resume'?'cedar-47':'SYNTHETIC active output'}]}}],operations:[]};
 }};
 const result={stages:[]};const work=resumeStages({client,threadId:'original-thread',attemptId:'synthetic-attempt',timeoutMs:100,result,save:()=>saved.push(structuredClone(result))});
 if(mode==='normal')await work;else await assert.rejects(work);
 const starts=commands.filter(c=>c.type==='runs.start');assert.equal(starts.length,mode==='failed'||mode==='unknown'?1:2);
 assert.ok(starts.every(c=>!c.input.includes('Remember the synthetic token')));
 assert.equal(saved[0].stages[0].state,'dispatching');assert.equal(saved[0].stages[0].requestId,'resume-synthetic-attempt-resume');
 assert.equal(commands.filter(c=>c.type==='runs.cancel').length,mode==='normal'?1:0);
});
