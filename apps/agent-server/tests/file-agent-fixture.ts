// Explicit SYNTHETIC HTTP response builder. Not a real model recording.
import type { FileToolRequest } from '../../../packages/app-contracts/file-tools.ts';
export function syntheticReply(api:'chat-completions'|'responses',turn:number,tools:FileToolRequest[]=[],text='SYNTHETIC file agent done'){
 const id=`synthetic-response-${turn}`;
 if(api==='chat-completions'){
  const delta=tools.length?{role:'assistant',content:'SYNTHETIC planning',tool_calls:tools.map((t,i)=>({index:i,id:`synthetic-tool-${turn}-${i}`,type:'function',function:{name:t.tool,arguments:JSON.stringify(t.parameters)}}))}:{role:'assistant',content:text};
  return [{id,object:'chat.completion.chunk',choices:[{index:0,delta,finish_reason:null}]},{id,object:'chat.completion.chunk',choices:[{index:0,delta:{},finish_reason:tools.length?'tool_calls':'stop'}],usage:{prompt_tokens:8,completion_tokens:7,total_tokens:15}}].map(e=>`data: ${JSON.stringify(e)}\n\n`).join('')+'data: [DONE]\n\n';
 }
 const items=tools.length?tools.map((t,i)=>({type:'function_call',id:`fc_synthetic_${turn}_${i}`,call_id:`call_synthetic_${turn}_${i}`,name:t.tool,arguments:JSON.stringify(t.parameters),status:'completed'})):[{id:`msg_synthetic_${turn}`,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]}];
 const events:unknown[]=[{type:'response.created',response:{id,status:'in_progress'}}];
 for(const [index,item] of items.entries()){
  events.push({type:'response.output_item.added',output_index:index,item:{...item,status:'in_progress',...('arguments' in item?{arguments:''}:{content:[]})}});
  if('arguments' in item)events.push({type:'response.function_call_arguments.delta',output_index:index,item_id:item.id,delta:item.arguments});
  else events.push({type:'response.output_text.delta',output_index:index,content_index:0,item_id:item.id,delta:text});
  events.push({type:'response.output_item.done',output_index:index,item});
 }
 events.push({type:'response.completed',response:{id,status:'completed',output:items,usage:{input_tokens:8,output_tokens:7,total_tokens:15,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}}});
 return events.map(e=>{const event=e as {type:string};return `event: ${event.type}\ndata: ${JSON.stringify(e)}\n\n`;}).join('');
}
