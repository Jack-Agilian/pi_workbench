import type { WireBody } from '../../packages/app-contracts/worker-ipc.ts';
/** One host-owned HTTP request. Pi retains the provider wire protocol and SSE parsing. */
export class ModelHttp {
  private readonly controller = new AbortController();
  private request?: Promise<void>; private reader?: ReadableStreamDefaultReader<Uint8Array>;
  private stopped = false; private reading = false; private total = 0; private remainder: Uint8Array = new Uint8Array();
  private closeResult?: Promise<void>;
  private readonly url: string; private readonly reserve: (bytes:number, body:string)=>void; private readonly fetch: typeof globalThis.fetch;
  constructor(url: string, reserve:(bytes:number, body:string)=>void, fetch = globalThis.fetch) { this.url=url;this.reserve=reserve;this.fetch=fetch; }
  receive(body:WireBody,reply:(body:WireBody)=>Promise<void>): void {
    if(this.stopped)throw new Error('model_http_closed');
    if(body.type==='model-http') {
      if(this.request || body.url!==this.url || body.method!=='POST' || /[\r\n]/.test(body.url) || Object.keys(body.headers).some(k=>['host','cookie','proxy-authorization'].includes(k.toLowerCase())))throw new Error('model_http_not_approved');
      try { this.reserve(Buffer.byteLength(body.body),body.body); } catch { this.stopped=true;this.request=reply({type:'model-http-error'});return; }
      this.request=(async()=>{
        const response=await this.fetch(this.url,{method:'POST',headers:body.headers,body:body.body,redirect:'error',signal:this.controller.signal});
        if(this.stopped){await response.body?.cancel();return;}
        if(!response.body)throw new Error('model_http_no_body');
        if (!response.ok) {
          // Provider errors may echo headers/input. Never feed those bytes into native history.
          await response.body.cancel();
          this.reader = new Response(JSON.stringify({error:{type:'api_error',message:'Provider request failed'}})).body!.getReader();
        } else this.reader=response.body.getReader();
        // No headers/cookies/provider error strings are logged or persisted.
        await reply({type:'model-http-head',status:response.status,headers:{'content-type':response.headers.get('content-type')??'application/octet-stream'}});
      })().catch(async()=>{if(!this.stopped)await reply({type:'model-http-error'});});
      void this.request.catch(()=>this.close()); return;
    }
    if(body.type!=='model-http-read'||!this.reader||this.reading)throw new Error('model_http_read_not_admitted');
    this.reading=true;
    const read=(async()=>{
      let data=this.remainder;let end=false;
      if(!data.byteLength){const next=await this.reader!.read();data=next.value??new Uint8Array();end=next.done;}
      if(this.stopped)return;
      if(this.total+data.byteLength>1_048_576)throw new Error('model_http_response_limit');this.total+=Math.min(data.byteLength,16384);
      this.remainder=data.slice(16384);
      this.reading=false;
      await reply({type:'model-http-chunk',data:Buffer.from(data.subarray(0,16384)).toString('base64'),end});
    })().catch(async()=>{if(!this.stopped)await reply({type:'model-http-error'});}).finally(()=>{this.reading=false;});
    // At most one read exists; close waits for the owned read as well as request setup.
    this.request=Promise.all([this.request,read]).then(()=>{});void this.request.catch(()=>this.close());
  }
  close():Promise<void>{
    if(!this.closeResult)this.closeResult=(async()=>{this.stopped=true;this.controller.abort();await this.reader?.cancel().catch(()=>{});await this.request;})();
    return this.closeResult;
  }
}
