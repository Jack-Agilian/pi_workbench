// Native Fetch seam for Pi HTTP transports. Worker remains OS/network denied.
import type { WireBody } from '../app-contracts/worker-ipc.ts';
export function modelFetch(send: (body: WireBody, requestId: string) => Promise<void>, multiple:()=>boolean=()=>false) {
  let sequence = 0; let stopped = false; let used = false; let occupied=false;
  let finalized:Promise<void>=Promise.resolve();
  const abandoned=new Set<string>();
  const pending = new Map<string, { resolve(body: WireBody): void; reject(error: Error): void }>();
  const ask = (body: WireBody, owned?:Set<string>): Promise<WireBody> => {
    if (stopped) return Promise.reject(new Error('model_transport_closed'));
    const id = `http-${++sequence}`;owned?.add(id);
    return new Promise<WireBody>((resolve,reject) => { pending.set(id,{resolve,reject}); void send(body,id).catch(() => { pending.delete(id); reject(new Error('model_transport_closed')); }); }).finally(()=>owned?.delete(id));
  };
  const close = () => { stopped = true; for (const p of pending.values()) p.reject(new Error('model_transport_closed')); pending.clear(); };
  const fetch: typeof globalThis.fetch = async (input, init) => {
    if(stopped)throw new Error('model_transport_closed');
    if(used&&!multiple())throw new Error('model_request_budget');
    if(occupied)throw new Error('model_request_concurrent');
    occupied=true;used=true;
    await finalized;
    const request = new Request(input, init);const owned=new Set<string>();
    let finishing:Promise<void>|undefined;
    const finish=()=>{
      if(!finishing){
        request.signal.removeEventListener('abort',onAbort);
        for(const id of owned){const p=pending.get(id);pending.delete(id);abandoned.add(id);p?.reject(new Error('model_request_finished'));}
        finishing=multiple()&&!stopped?ask({type:'model-http-finish'}).then(reply=>{if(reply.type!=='model-http-finished')throw new Error('model_transport_finish');}):Promise.resolve();
        finalized=finishing;void finalized.catch(close);occupied=false;
      }
      return finishing;
    };
    const onAbort=close;
    try{
      if (request.method !== 'POST') throw new Error('model_transport_method');
      request.signal.throwIfAborted(); request.signal.addEventListener('abort',onAbort,{once:true});
      const body = await request.text();
      const response = await ask({type:'model-http',url:request.url,method:'POST',headers:Object.fromEntries(request.headers),body},owned);
      if (response.type !== 'model-http-head') throw new Error('model_transport_failed');
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try { const chunk = await ask({type:'model-http-read'},owned); if(chunk.type !== 'model-http-chunk') throw new Error('model_transport_failed'); if(chunk.data)controller.enqueue(Buffer.from(chunk.data,'base64')); if(chunk.end){await finish();controller.close();} }
          catch { void finish().catch(close);controller.error(new Error('model_transport_failed')); }
        }, cancel:()=>multiple()?finish():close(),
      });
      return new Response(stream,{status:response.status,headers:response.headers});
    }catch(error){void finish().catch(close);throw error;}
  };
  return { fetch, close, receive(id:string,body:WireBody) { const p=pending.get(id); if(!p)return abandoned.delete(id); pending.delete(id); p.resolve(body); return true; } };
}
