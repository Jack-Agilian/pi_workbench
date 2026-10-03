// Host-only Seatbelt profiles. These inputs are never Renderer/Worker permissions.
// Reference: anthropics/sandbox-runtime@9e93406ab2e0b6e9794624896f729560dc9445db,
// macos-sandbox-utils.ts (deny precedence and ancestor movement protection).
// We retain our fixed Mac launcher/guardian, not the upstream general sandbox runtime.
import { realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { inside } from '../../packages/pi-adapter/path-scope.ts';

const paths = (roots: readonly string[]) => roots.map(p => `(subpath ${JSON.stringify(p)})`).join(' ');
const systemReads = '(allow file-read* (subpath "/System") (subpath "/usr/lib") (subpath "/usr/bin") (subpath "/bin") (literal "/") (literal "/dev/null") (literal "/dev/urandom") (literal "/dev/random") (subpath "/dev/fd"))';

/** Existing workspace policy, shared by the Worker and guardian-owned Bash. */
export function restrictedMacProfile(readRoots: readonly string[], writeRoots: readonly string[], denied: readonly string[] = []): string {
  return ['(version 1)', '(allow default)', '(deny network*)', '(deny file-read*)', '(allow file-read-metadata)', '(deny file-write*)',
    `(allow file-read* ${paths(readRoots)})`, systemReads,
    `(allow file-write* ${paths(writeRoots)})`, '(allow file-write* (literal "/dev/null"))',
    ...(denied.length ? [`(deny file-read-data file-write* ${paths(denied)})`] : [])].join(' ');
}

export interface PrivateTree {
  root: string;
  // Only host-owned per-process home/session directories; never a tool-supplied exception.
  writableSubtrees?: readonly string[];
}
export interface FullMacAccess {
  privateTrees: readonly PrivateTree[];
  readOnlyRoots: readonly string[];
  network: 'brokered' | 'direct';
}

function canonicalDirectory(value: string): string {
  if (!isAbsolute(value) || /[\x00-\x1f\x7f]/.test(value)) throw new Error('invalid_access_root');
  const canonical = realpathSync(value);
  if (canonical !== resolve(value) || canonical === '/' || !statSync(canonical).isDirectory()) throw new Error('noncanonical_access_root');
  return canonical;
}

/**
 * Full filesystem access except host-private trees and immutable application/runtime code.
 * Not yet a selectable product permission: Run admission and native file-tool binding must
 * select the same policy before that UI is enabled. No policy is inferred from model output.
 */
export function fullMacProfile(access: FullMacAccess): string {
  if (process.platform !== 'darwin' || process.arch !== 'arm64' || process.version !== 'v24.21.0') throw new Error('full_access_platform_unsupported');
  if (!access.privateTrees.length || !access.readOnlyRoots.length || !['brokered', 'direct'].includes(access.network)) throw new Error('incomplete_full_access_policy');
  const privateTrees = access.privateTrees.map(tree => {
    const root = canonicalDirectory(tree.root);
    const exceptions = (tree.writableSubtrees ?? []).map(canonicalDirectory);
    if (exceptions.some(p => p === root || !inside(root, p))) throw new Error('invalid_private_tree_exception');
    return { root, exceptions };
  });
  const readOnly = access.readOnlyRoots.map(canonicalDirectory);
  // Multiple trees may nest. Each deny is independent, so a nested credential directory
  // stays denied even when an outer private tree has a writable home exception.
  for (const tree of privateTrees) for (const exception of tree.exceptions) {
    if (readOnly.some(root => inside(root, exception) || inside(exception, root))) throw new Error('writable_immutable_overlap');
  }
  const rules = ['(version 1)', '(allow default)', '(deny network*)',
    // Full IP networking does not grant access to local privileged Unix/Mach services.
    ...(access.network === 'direct' ? ['(allow network-outbound (remote ip "*:*"))', '(allow network-bind (local ip "*:*"))', '(allow network-inbound (local ip "*:*"))'] : []),
    '(deny mach-lookup)', '(deny appleevent-send)', '(deny process-info*)', '(deny signal)', '(deny mach-priv-task-port)',
    '(allow process-info* signal mach-priv-task-port (target same-sandbox))'];
  for (const tree of privateTrees) {
    const root = `(subpath ${JSON.stringify(tree.root)})`;
    const filter = tree.exceptions.length ? `(require-all ${root} ${tree.exceptions.map(p => `(require-not (subpath ${JSON.stringify(p)}))`).join(' ')})` : root;
    rules.push(`(deny file-read-data file-write* ${filter})`);
  }
  rules.push(`(deny file-write* ${paths(readOnly)})`);
  // A path deny alone can be bypassed by renaming its containing directory. Pin every
  // ancestor vnode (not the ancestor's whole subtree), including exception roots.
  const pins = new Set<string>();
  for (const root of [...privateTrees.flatMap(t => [t.root, ...t.exceptions]), ...readOnly]) {
    let cursor = root;
    for (;;) { pins.add(cursor); const parent = dirname(cursor); if (parent === cursor) break; cursor = parent; }
  }
  rules.push(`(deny file-write-unlink file-write-create ${[...pins].map(p => `(literal ${JSON.stringify(p)})`).join(' ')})`);
  return rules.join(' ');
}
