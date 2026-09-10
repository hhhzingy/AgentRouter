import { readFileSync, existsSync, statSync, realpathSync } from 'node:fs';
import { resolve, dirname, relative, basename, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { C1R1Error } from '../client-contract/c1r1p1/index.ts';
export function inspectArtifact(database: string, row: any, revision: number) {
  if (!/^[a-f0-9]{64}$/.test(row.storage_key) || row.byte_size > 20971520)
    throw new C1R1Error('INVALID_PARAMS');
  const root = resolve(dirname(database), 'artifacts'),
    path = resolve(root, row.storage_key);
  let state = row.state,
    bytes: Buffer | undefined;
  if (!existsSync(path)) state = 'MISSING';
  else {
    const real = realpathSync(path),
      rel = relative(realpathSync(root), real);
    const stat = statSync(real);
    if (rel.startsWith('..') || isAbsolute(rel) || !stat.isFile() || stat.size > 20971520)
      throw new C1R1Error('SCOPE_DENIED');
    bytes = readFileSync(real);
    if (
      bytes.length !== row.byte_size ||
      createHash('sha256').update(bytes).digest('hex') !== row.sha256
    )
      state = 'QUARANTINED';
  }
  const source = JSON.parse(row.source_json);
  return {
    bytes,
    view: {
      id: row.id,
      mediaType: row.media_type,
      byteSize: row.byte_size,
      sha256: row.sha256,
      state,
      displaySource: basename(String(source.path ?? source.name ?? row.id)).slice(0, 240),
      createdAtMs: row.created_at_ms,
      revision,
    },
  };
}
