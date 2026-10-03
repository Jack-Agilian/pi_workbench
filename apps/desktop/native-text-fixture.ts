// Node-only setup for actual Electron reading tests. All Pi records are SYNTHETIC.
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Binding } from '../../packages/app-contracts/index.ts';
import type { ProductCore } from '../agent-server/core.ts';
import { projectMessages } from '../../packages/pi-adapter/presentation.ts';
export const READING_TITLE='SYNTHETIC 安全阅读';
export function seedNativeText(core:ProductCore,profile:string,binding:Binding,input:string){
 const cwd=core.threadWorkspace(binding.threadId).path,dir=join(profile,'state','sessions',binding.threadId);mkdirSync(dir,{recursive:true});
 const manager=SessionManager.create(cwd,dir);core.bindNativeSession(binding,manager.getSessionFile()!,false);core.recordNativeRange(binding,manager.getSessionFile()!,'start',null);
 manager.appendMessage({role:'user',content:input,timestamp:1});
 const body=`# ${READING_TITLE}\n\n**加粗内容** 与 *斜体*。\n\n| 项目 | 状态 |\n| --- | --- |\n| 审批 | 保留 |\n\n- [x] 已核验\n- [ ] 待处理\n\n\`\`\`typescript\nconst value = '<script>SYNTHETIC_CODE</script>';\n\`\`\`\n\n![SYNTHETIC_REMOTE](https://example.invalid/tracker.png)\n\n[不安全链接](javascript:alert(1)) [安全地址](https://example.invalid/docs)\n\n<img src="https://example.invalid/evil.png" onerror="globalThis.injection=true">\n\n`+'中😀'.repeat(7000)+'\n\nBearer SYNTHETIC_READING_SECRET\n\n末尾：SYNTHETIC_COMPLETE_BODY';
 for(let i=0;i<21;i++)manager.appendMessage({role:'assistant',content:[{type:'text',text:i===0?body:`SYNTHETIC_EXTRA_MESSAGE_${i}`}],api:'openai-responses',provider:'SYNTHETIC',model:'SYNTHETIC',timestamp:i+2,stopReason:'stop',usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}});
 core.bindNativeSession(binding,manager.getSessionFile()!,true);core.recordNativeRange(binding,manager.getSessionFile()!,'end',manager.getLeafId());core.projectSession(binding,projectMessages(manager.getBranch()));
}
