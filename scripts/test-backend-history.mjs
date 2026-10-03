import './check-environment.mjs';
import { spawnSync } from 'node:child_process';
import { mkdtempSync,realpathSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { repository,sterileEnvironment } from '../apps/agent-server/worker-launcher.ts';
const root=realpathSync(mkdtempSync(join(tmpdir(),'backend-tests-')));
try{
 const result=spawnSync(process.execPath,['--import',join(repository,'scripts/probe-no-network.mjs'),'--test',join(repository,'apps/agent-server/tests/backend-history.test.ts'),join(repository,'apps/agent-server/tests/native-text.test.ts'),join(repository,'scripts/desktop-profile.test.mjs')],{cwd:root,env:sterileEnvironment(root),stdio:'inherit',timeout:180000});
 if(result.error||result.signal)throw new Error('backend_suite_terminated');process.exitCode=result.status??1;
}finally{rmSync(root,{recursive:true,force:true});}
