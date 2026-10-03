// Host-generated Worker configuration; never accepted as a Renderer command or tool argument.
import { exact } from './worker-ipc.ts';
export interface FullFileAccess {
  privateTrees: { root: string; allowedSubtrees: string[] }[];
  readOnlyRoots: string[];
}
export function parseFullFileAccess(value: unknown): FullFileAccess {
  const r = exact(value, ['privateTrees', 'readOnlyRoots']);
  const path = (v: unknown) => { if (typeof v !== 'string' || !v.startsWith('/') || v === '/' || v.length > 4096 || /[\x00-\x1f\x7f]/.test(v)) throw new Error('invalid_file_scope'); };
  const paths = (v: unknown) => { if (!Array.isArray(v) || v.length > 64) throw new Error('invalid_file_scope'); v.forEach(path); };
  if (!Array.isArray(r.privateTrees) || !r.privateTrees.length || r.privateTrees.length > 64) throw new Error('invalid_file_scope');
  for (const value of r.privateTrees) { const t = exact(value, ['root', 'allowedSubtrees']); path(t.root); paths(t.allowedSubtrees); }
  paths(r.readOnlyRoots); if (!(r.readOnlyRoots as string[]).length) throw new Error('invalid_file_scope');
  return r as unknown as FullFileAccess;
}
