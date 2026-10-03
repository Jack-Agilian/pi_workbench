import { realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FullFileAccess } from '../../packages/app-contracts/file-access.ts';
import { inside } from '../../packages/pi-adapter/path-scope.ts';
import { fullMacProfile } from './macos-access.ts';

/** Called only by trusted host composition, after normal workspace admission. */
export function fullFileAccess(workspace: string, privateRoots: readonly string[]): FullFileAccess {
  const access: FullFileAccess = {
    privateTrees: [...new Set(privateRoots)].map(value => {
      const root = realpathSync(value);
      if (root !== value || inside(workspace, root)) throw new Error('private_workspace_overlap');
      return { root, allowedSubtrees: inside(root, workspace) ? [workspace] : [] };
    }),
    readOnlyRoots: [realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../..')), resolve(dirname(realpathSync(process.execPath)), '..')],
  };
  // Validate platform, real directory identities and exception overlap before accepting mode.
  fullMacProfile({network:'brokered',readOnlyRoots:access.readOnlyRoots,privateTrees:access.privateTrees.map(t=>({root:t.root,writableSubtrees:t.allowedSubtrees}))});
  return access;
}
