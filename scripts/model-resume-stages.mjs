// Same product-command continuation used by the explicit live driver; test clients are synthetic.
import assert from 'node:assert/strict';
export async function resumeStages({client,threadId,attemptId,timeoutMs,result,save}) {
  for(const stage of ['resume','cancel']){
   const requestId=`resume-${attemptId}-${stage}`;
   const record={stage,requestId,state:'dispatching',observedStream:false,cancelSent:false};result.stages.push(record);save();
   const input=stage==='resume'?'What synthetic token did I ask you to remember? Reply with that token only.':'Write a long numbered list from 1 to 200, spelling every integer in English and adding a short sentence for each. This is a synthetic cancellation test. Do not summarize or skip numbers.';
   const ack=await client.request({type:'command',command:{type:'runs.start',requestId,threadId:threadId,input}});record.runId=ack.id;save();
   const start=Date.now();let ended=false;
   while(Date.now()-start<timeoutMs+20000){
    const snap=await client.request({type:'thread',threadId:threadId});const run=snap.runs.find(r=>r.id===ack.id);
    const assistant=snap.presentations.find(p=>p.runId===ack.id)?.value.messages.filter(m=>m.role==='assistant').at(-1);
    if(run?.state==='running'&&assistant?.text){record.observedStream=true;if(stage==='cancel'&&!record.cancelSent){record.cancelSent=true;save();await client.request({type:'command',command:{type:'runs.cancel',requestId:`resume-${attemptId}-cancel-command`,runId:ack.id}});}}
    if(run&&['completed','failed','cancelled','unknown'].includes(run.state)){
     record.state=run.state;record.replyMatches=stage==='resume'?assistant?.text.includes('cedar-47')===true:null;record.zeroOperations=snap.operations.length===0;record.milliseconds=Date.now()-start;record.outcome=snap.modelOutcomes?.find(o=>o.runId===ack.id)?.value;save();ended=true;break;
    }
    await new Promise(r=>setTimeout(r,40));
   }
   assert.equal(ended,true);assert.equal(record.zeroOperations,true);assert.equal(record.state,stage==='resume'?'completed':'cancelled');
   if(stage==='resume')assert.equal(record.replyMatches,true);else assert.ok(record.observedStream&&record.cancelSent);
  }
}
