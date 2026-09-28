// Native Fetch seam for Pi HTTP transports. Worker remains OS/network denied.
import type { WireBody } from '../app-contracts/worker-ipc.ts';
export function modelFetch(send: (body: WireBody, requestId: string) => Promise<void>) {
  let sequence = 0; let stopped = false; let used = false;
  const pending = new Map<string, { resolve(body: WireBody): void; reject(error: Error): void }>();
  const ask = (body: WireBody): Promise<WireBody> => {
    if (stopped) return Promise.reject(new Error('model_transport_closed'));
    const id = `http-${++sequence}`;
    return new Promise((resolve,reject) => { pending.set(id,{resolve,reject}); void send(body,id).catch(() => { pending.delete(id); reject(new Error('model_transport_closed')); }); });
  };
  const close = () => { stopped = true; for (const p of pending.values()) p.reject(new Error('model_transport_closed')); pending.clear(); };
  const fetch: typeof globalThis.fetch = async (input, init) => {
    if (used) throw new Error('model_request_budget'); used = true;
    const request = new Request(input, init);
    if (request.method !== 'POST') throw new Error('model_transport_method');
    request.signal.throwIfAborted(); request.signal.addEventListener('abort',close,{once:true});
    const body = await request.text();
    const response = await ask({type:'model-http',url:request.url,method:'POST',headers:Object.fromEntries(request.headers),body});
    if (response.type !== 'model-http-head') throw new Error('model_transport_failed');
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try { const chunk = await ask({type:'model-http-read'}); if(chunk.type !== 'model-http-chunk') throw new Error('model_transport_failed'); if(chunk.data)controller.enqueue(Buffer.from(chunk.data,'base64')); if(chunk.end){request.signal.removeEventListener('abort',close);controller.close();} }
        catch { controller.error(new Error('model_transport_failed')); }
      }, cancel: close,
    });
    return new Response(stream,{status:response.status,headers:response.headers});
  };
  return { fetch, close, receive(id:string,body:WireBody) { const p=pending.get(id); if(!p)return false; pending.delete(id); p.resolve(body); return true; } };
}
