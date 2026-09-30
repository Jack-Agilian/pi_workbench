import { join } from 'node:path';
/** Trusted local development selection; never a Renderer path or a live-budget clone. */
export function desktopProfile({root,home,mode,developmentName}) {
  if(developmentName!==undefined){
    if(!/^[a-z][a-z0-9-]{0,47}$/.test(developmentName)||mode==='--model')throw new Error('invalid_development_profile');
    return join(root,'.artifacts','desktop-profiles',developmentName);
  }
  return mode==='--demo'?join(root,'.artifacts/desktop-demo'):join(home,'Library/Application Support/Pi Workbench',mode==='--model-shell-offline'?'offline-shell-profile':mode==='--model-files-offline'?'offline-files-profile':mode==='--model-offline'?'offline-profile':'model-profile');
}
