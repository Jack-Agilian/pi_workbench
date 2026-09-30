import { realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { inside } from '../../packages/pi-adapter/path-scope.ts';

/** Host-owned admission. Persisted workspace IDs are not permanent filesystem grants. */
export class WorkspaceAdmission {
  private readonly protectedRoots: string[];
  private readonly profile: string;
  constructor(profile: string, protectedRoots: readonly string[]) {
    this.profile=profile;
    this.protectedRoots = [...protectedRoots];
  }
  check(path: string, managed = false): string {
    try {
      const canonical = realpathSync(path);
      if (canonical !== path || !statSync(canonical).isDirectory()) throw new Error();
      const managedRoot = join(this.profile, 'workspace');
      const ownWorkspace = managed && canonical === managedRoot;
      for (const root of [this.profile, ...this.protectedRoots]) {
        const protectedPath = realpathSync(root);
        if(protectedPath!==root||!statSync(protectedPath).isDirectory())throw new Error();
        // Only the exact host-created workspace is exempt from its profile/config ancestor.
        // A new protected directory in that workspace is never exempt.
        if (ownWorkspace && inside(protectedPath, this.profile)) continue;
        if (inside(canonical, protectedPath) || inside(protectedPath, canonical)) throw new Error();
      }
      return canonical;
    } catch { throw new Error('workspace_invalid'); }
  }
  protect(path: string, workspaces: readonly {path:string}[]): void {
    const canonical = realpathSync(path);
    for (const workspace of workspaces) {
      const current = realpathSync(workspace.path);
      if (inside(current, canonical) || inside(canonical, current)) throw new Error('workspace_invalid');
    }
    this.protectedRoots.push(canonical);
  }
}
