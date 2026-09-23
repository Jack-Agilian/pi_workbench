import pathApi from 'node:path';
/** Lexical containment only; explicit path flavor also permits cross-platform regression tests. */
export function inside(root: string, path: string, flavor: Pick<typeof pathApi, 'relative' | 'resolve' | 'isAbsolute' | 'sep'> = pathApi): boolean {
  const rel = flavor.relative(root, flavor.resolve(path));
  return rel === '' || (!rel.startsWith(`..${flavor.sep}`) && rel !== '..' && !flavor.isAbsolute(rel));
}
