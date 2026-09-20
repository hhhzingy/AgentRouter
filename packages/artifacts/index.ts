import {
  realpathSync,
  openSync,
  readFileSync,
  writeFileSync,
  closeSync,
  fsyncSync,
  fstatSync,
  mkdirSync,
  renameSync,
  existsSync,
} from 'node:fs';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { RouteError } from '../protocol/index.ts';
export function containedPath(root: string, path: string) {
  if (
    !path ||
    isAbsolute(path) ||
    path.includes(':') ||
    path
      .split(/[\\/]/)
      .some((p) => p === '..' || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))
  )
    throw new RouteError('PATH_OUTSIDE_WORKSPACE', 'AUTHORIZATION');
  const base = realpathSync(root),
    target = realpathSync(resolve(base, path));
  const rel = relative(base, target);
  if (rel === '..' || rel.startsWith('..\\') || rel.startsWith('../') || isAbsolute(rel))
    throw new RouteError('PATH_OUTSIDE_WORKSPACE', 'AUTHORIZATION');
  return target;
}
export function freezeFile(root: string, path: string, store: string) {
  const target = containedPath(root, path);
  const fd = openSync(target, 'r');
  let data: Buffer;
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size > 20971520) throw new RouteError('ARTIFACT_LIMIT');
    data = readFileSync(fd);
    const after = fstatSync(fd);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino)
      throw new RouteError('SOURCE_CHANGED', 'AMBIGUOUS');
  } finally {
    closeSync(fd);
  }
  const sha256 = createHash('sha256').update(data).digest('hex');
  mkdirSync(store, { recursive: true });
  const temp = join(store, `${randomUUID()}.tmp`),
    dest = join(store, sha256);
  const out = openSync(temp, 'wx');
  try {
    writeFileSync(out, data);
    fsyncSync(out);
  } finally {
    closeSync(out);
  }
  if (!existsSync(dest)) renameSync(temp, dest);
  if (createHash('sha256').update(readFileSync(dest)).digest('hex') !== sha256)
    throw new RouteError('ARTIFACT_CORRUPTED', 'AMBIGUOUS');
  return { storage_key: sha256, sha256, byte_size: data.length };
}
/** Canonical blob filename is the content hash. Role rows may store `project_id/hash`. */
export function artifactBlobHash(storageKey: string): string {
  const match = /^(?:project_[A-Za-z0-9_-]+\/)?([a-f0-9]{64})$/.exec(storageKey);
  if (!match) throw new RouteError('INVALID_STORAGE_KEY');
  return match[1];
}
/** Prefer artifacts/<hash>; fall back to legacy artifacts/<project>/<hash>. */
export function resolveArtifactBlobPath(root: string, storageKey: string): string {
  const hash = artifactBlobHash(storageKey);
  const hashed = resolve(root, hash);
  if (existsSync(hashed)) return hashed;
  const prefixed = resolve(root, storageKey);
  if (existsSync(prefixed)) return prefixed;
  return hashed;
}
