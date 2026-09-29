import { constants, openSync, closeSync, fstatSync, readFileSync, realpathSync } from 'node:fs';
import { relative, isAbsolute, sep } from 'node:path';
import { exact, record } from '../app-contracts/worker-ipc.ts';
/** App-owned literal auth.json input only. No OAuth, command expansion or environment fallback. */
export function readConfiguredApiKey(path:string,provider:string,repository:string):string|undefined {
  let fd:number|undefined;let bytes:Buffer|undefined;
  try {
    const resolved=realpathSync(path);const within=relative(realpathSync(repository),resolved);
    if(resolved.split(sep).includes('.pi')||(!isAbsolute(within)&&within!=='..'&&!within.startsWith('..'+sep)))throw new Error('private_path_required');
    fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const stat=fstatSync(fd);
    if(!stat.isFile()||stat.uid!==process.getuid?.()||(stat.mode&0o077)!==0||stat.size>65536)throw new Error('private_file_required');
    bytes=readFileSync(fd);const config=record(JSON.parse(bytes.toString('utf8')));
    if(!Object.hasOwn(config,provider))return;
    const credential=exact(config[provider],['type','key']);
    if(credential.type!=='api_key'||typeof credential.key!=='string'||credential.key.length>8192||/[\s\0$]/.test(credential.key)||credential.key.startsWith('!'))throw new Error('literal_key_required');
    return credential.key||undefined;
  } catch { throw new Error('model_credentials_invalid'); }
  finally {bytes?.fill(0);if(fd!==undefined)closeSync(fd);}
}
