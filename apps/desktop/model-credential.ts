import { constants, openSync, fstatSync, readFileSync, closeSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';
/** Called only with a native file-dialog selection. Renderer never supplies a path or sees a key. */
export async function useModelCredentialFile(path: string, repository: string, consume: (key: string) => Promise<void>): Promise<void> {
  const resolved = realpathSync(path);
  const within = relative(realpathSync(repository), resolved);
  if (!resolved.endsWith('.key') || resolved.split(sep).includes('.pi') || (!isAbsolute(within) && within !== '..' && !within.startsWith('..' + sep))) throw new Error('credential_file_not_admitted');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let bytes: Buffer | undefined;
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0 || stat.size < 1 || stat.size > 8192) throw new Error('credential_file_not_admitted');
    bytes = readFileSync(fd);
    const key = bytes.toString('utf8').trim();
    if (!key || /[\s\0]/.test(key)) throw new Error('credential_file_invalid');
    await consume(key);
  } finally { bytes?.fill(0); closeSync(fd); }
}
