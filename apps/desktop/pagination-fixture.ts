import { seedNativeText } from './native-text-fixture.ts';
// Trusted offline test setup, before the App Server starts. Never imported by Renderer/preload.
// These are explicitly synthetic product lifecycle records, not model or Worker evidence.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DesktopHost } from '../agent-server/desktop-host.ts';
import { digest } from '../../packages/pi-adapter/controlled-tools.ts';
export async function seedPaginationFixture(profile: string) {
  const host = new DesktopHost(profile);
  try {
    const threadId = host.core.handle({type:'threads.create',requestId:'pagination-fixture',workspaceId:'demo-workspace',title:'SYNTHETIC persisted pagination'}).id;
    for (let i = 0; i < 60; i++) {
      host.core.handle({type:'runs.start',requestId:`page-run-${i}`,threadId,input:`SYNTHETIC persisted history ${i}`});
      const binding = host.core.dispatchNext()!; host.core.markRunning(binding);
      host.core.projectSession(binding,{messages:Array.from({length:4},(_,j)=>({id:`message-${i}-${j}`,role:'assistant',text:'文'.repeat(2000),truncated:false})),omitted:false});
      if (i < 10) {
        const path = i<3?'pagination-versions.md':`pagination-${i}.md`, text = `# SYNTHETIC file ${i}`, hash = digest(text);
        const op = host.core.requestOperation(binding,{toolCallId:`page-tool-${i}`,tool:'write',parametersDigest:hash,deadline:Date.now()+10000,artifactPath:path});
        host.core.handle({type:'approvals.resolve',requestId:`page-approve-${i}`,operationId:op.id,parametersDigest:hash,decision:'allow'});
        host.core.claimOperation(binding,op.id,hash);
        writeFileSync(join(profile,'workspace',path),text);
        host.core.finishOperation(binding,op.id,'succeeded',hash); host.core.recordArtifact(binding,op.id,path);
      }
      if(i===59)seedNativeText(host.core,profile,binding,`SYNTHETIC persisted history ${i}`);
      host.core.settle(binding,'completed',{piIdle:true,hostClean:true});
    }
    assert.ok(Buffer.byteLength(JSON.stringify(host.request({type:'thread',threadId}))) > 1_200_000);
  } finally { await host.close(); }
}
