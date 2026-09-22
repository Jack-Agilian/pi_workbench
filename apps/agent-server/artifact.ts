import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export function artifactPath(workspace: string, path: string): string {
  if (typeof path !== 'string' || path.length > 1024 || isAbsolute(path) || path.includes('\0') || !path.endsWith('.md')) throw new Error('unsupported_artifact');
  const target = resolve(workspace, path); const rel = relative(workspace, target);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new Error('outside_workspace');
  return rel;
}
/** Plain UTF-8 Markdown only. Precondition checks are not an OS-atomic sandbox. */
export function inspectMarkdown(workspace: string, path: string) {
  const rel = artifactPath(workspace, path); const target = resolve(workspace, rel);
  let current = workspace;
  for (const part of ['', ...rel.split(sep)]) {
    current = join(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error('symlink_denied');
  }
  const fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd); const limit = 1024 * 1024;
    if (!before.isFile() || before.size > limit) throw new Error('unsupported_artifact');
    const buffer = Buffer.alloc(limit + 1); let size = 0;
    while (size < buffer.length) {
      const count = readSync(fd, buffer, size, buffer.length - size, null);
      if (!count) break;
      size += count;
    }
    const after = fstatSync(fd);
    if (size > limit || size !== before.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('artifact_changed_during_read');
    const data = buffer.subarray(0, size); const text = new TextDecoder('utf-8', { fatal: true }).decode(data);
    if (text.includes('\0')) throw new Error('unsupported_artifact');
    return { path: rel, bytes: size, digest: createHash('sha256').update(data).digest('hex'), text };
  } finally { closeSync(fd); }
}
