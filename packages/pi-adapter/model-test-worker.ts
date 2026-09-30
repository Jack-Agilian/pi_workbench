// Explicit SYNTHETIC provider fixture; only trusted offline composition selects this entry.
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai';
import { serveWorker } from './worker-runtime.ts';
import { modelServices } from './model-services.ts';
serveWorker({ model: async (options,selection,key,fetch) => {
  if(selection.mode!=='offline')throw new Error('synthetic_only');
  const provider=fauxProvider({provider:'workbench-synthetic',models:[{id:'synthetic-text'}],tokensPerSecond:100,tokenSize:{min:2,max:4}});
  if(selection.shellTools)provider.setResponses([
    fauxAssistantMessage(fauxToolCall('bash',{command:'printf SYNTHETIC-check; exit 7'},{id:'synthetic-shell-first'}),{stopReason:'toolUse'}),
    fauxAssistantMessage(fauxToolCall('bash',{command:'printf "# SYNTHETIC shell result\\n" > synthetic-shell.md'},{id:'synthetic-shell-second'}),{stopReason:'toolUse'}),
    fauxAssistantMessage('SYNTHETIC Bash workflow ended. A nonzero exit was followed by a separately approved command. Shell writes are not automatically registered as artifacts.'),
  ]);
  else if(selection.fileTools)provider.setResponses([
    fauxAssistantMessage(fauxToolCall('write',{path:'synthetic-agent.md',content:'# SYNTHETIC first\n'},{id:'synthetic-write'}),{stopReason:'toolUse'}),
    context=>context.messages.some(m=>m.role==='toolResult'&&m.isError)?fauxAssistantMessage('SYNTHETIC operation refused; no retry.'):fauxAssistantMessage([
      fauxToolCall('read',{path:'synthetic-agent.md'},{id:'synthetic-read'}),
      fauxToolCall('edit',{path:'synthetic-agent.md',edits:[{oldText:'first',newText:'edited'}]},{id:'synthetic-edit'})],{stopReason:'toolUse'}),
    fauxAssistantMessage('SYNTHETIC file workflow ended. See the authoritative operation results.'),
  ]);
  else provider.setResponses([async context=>{
    const text=context.messages.filter(m=>m.role==='user').map(m=>typeof m.content==='string'?m.content:m.content.filter(c=>c.type==='text').map(c=>c.text).join('')).join(' | ');
    if(text.includes('[error]'))return fauxAssistantMessage('',{stopReason:'error',errorMessage:'SYNTHETIC_PROVIDER_FAILURE'});
    if(text.includes('[long]'))return fauxAssistantMessage('SYNTHETIC '+ '中文测试 '.repeat(700));
    return fauxAssistantMessage('SYNTHETIC response: '+text);
  }]);
  return modelServices(options,selection,key,fetch,provider.provider);
} });
