// Explicit SYNTHETIC provider fixture; only trusted offline composition selects this entry.
import { fauxProvider, fauxAssistantMessage } from '@earendil-works/pi-ai';
import { serveWorker } from './worker-runtime.ts';
import { modelServices } from './model-services.ts';
serveWorker({ model: async (options,selection,key,fetch) => {
  if(selection.mode!=='offline')throw new Error('synthetic_only');
  const provider=fauxProvider({provider:'workbench-synthetic',models:[{id:'synthetic-text'}],tokensPerSecond:100,tokenSize:{min:2,max:4}});
  provider.setResponses([async context=>{
    const text=context.messages.filter(m=>m.role==='user').map(m=>typeof m.content==='string'?m.content:m.content.filter(c=>c.type==='text').map(c=>c.text).join('')).join(' | ');
    if(text.includes('[error]'))return fauxAssistantMessage('',{stopReason:'error',errorMessage:'SYNTHETIC_PROVIDER_FAILURE'});
    if(text.includes('[long]'))return fauxAssistantMessage('SYNTHETIC '+ '中文测试 '.repeat(700));
    return fauxAssistantMessage('SYNTHETIC response: '+text);
  }]);
  return modelServices(options,selection,key,fetch,provider.provider);
} });
