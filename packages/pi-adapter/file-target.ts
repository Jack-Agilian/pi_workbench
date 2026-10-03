// Shared host/Operations target admission, not a replacement for Pi's tool implementation.
import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import type { FullFileAccess } from '../app-contracts/file-access.ts';
import { inside } from './path-scope.ts';

export function controlledFileTarget(workspace: string, path: string, access?: FullFileAccess, write = false): string {
  if (!path || /^[@~]/.test(path) || /[\x00-\x1f\x7f\u00a0\u202f]/.test(path)) throw new Error('unsupported_probe_path');
  let target = resolve(workspace, path);
  if (access) {
    // Resolve existing parent aliases before computing the approval identity. The canonical
    // target is subsequently used by Pi and rechecked; missing parents are not fabricated.
    let parent = target; const tail: string[] = [];
    for (;;) {
      try { target = join(realpathSync(parent), ...tail); break; }
      catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT') || dirname(parent) === parent) throw error;
        tail.unshift(basename(parent)); parent = dirname(parent);
      }
    }
    for (const tree of access.privateTrees) {
      if (inside(tree.root, target) && !tree.allowedSubtrees.some(root => inside(root, target))) throw new Error('private_file_target');
    }
    if (write && access.readOnlyRoots.some(root => inside(root, target) || inside(target, root))) throw new Error('readonly_file_target');
  } else if (target === workspace || !inside(workspace, target)) throw new Error('outside_workspace');
  return target;
}
export function fileWirePath(workspace: string, target: string): string {
  return inside(workspace, target) && target !== workspace ? relative(workspace, target) : target;
}
/** Recheck the canonical target immediately before IO. Not an atomic compare-and-swap. */
export function assertNoFileSymlinks(root: string, target: string): void {
  if (!inside(root, target)) throw new Error('outside_workspace');
  let current = root;
  for (const part of ['', ...relative(root, target).split('/').filter(Boolean)]) {
    current = resolve(current, part);
    try { if (lstatSync(current).isSymbolicLink()) throw new Error('symlink_denied'); }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
  }
}
