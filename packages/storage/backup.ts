import Database from 'better-sqlite3';
import { mkdirSync, existsSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
/** 按当前完整迁移集校验快照 schema（与 openApplicationStore 的校验和口径一致）。 */
function openSnapshot(path: string) {
  const db = new Database(path);
  const names = readdirSync(new URL('./migrations/', import.meta.url)).filter((f) =>
    f.endsWith('.sql'),
  ).sort();
  const rows = db.prepare('select version,checksum from schema_migrations order by version').all() as {
    version: number;
    checksum: string;
  }[];
  if (
    rows.length !== names.length ||
    rows.some(
      (r, i) =>
        r.version !== i + 1 ||
        r.checksum !==
          createHash('sha256')
            .update(readFileSync(new URL('./migrations/' + names[i], import.meta.url), 'utf8'))
            .digest('hex'),
    )
  ) {
    db.close();
    throw Error('BACKUP_SNAPSHOT_MIGRATION_MISMATCH');
  }
  return db;
}
export async function backupStore(
  db: Database.Database,
  artifactRoot: string,
  destination: string,
) {
  if (existsSync(destination)) throw Error('BACKUP_DESTINATION_EXISTS');
  mkdirSync(destination, { recursive: true });
  const target = resolve(destination, 'router.db');
  await db.backup(target);
  const snapshot = openSnapshot(target);
  try {
    const artifacts = snapshot
      .prepare("select storage_key,sha256,byte_size from artifacts where state='AVAILABLE'")
      .all() as { storage_key: string; sha256: string; byte_size: number }[];
    mkdirSync(resolve(destination, 'artifacts'));
    for (const artifact of artifacts) {
      if (!/^(?:project_[A-Za-z0-9_-]+\/)?[a-f0-9]{64}$/.test(artifact.storage_key))
        throw Error('INVALID_STORAGE_KEY');
      const file = readFileSync(resolve(artifactRoot, artifact.storage_key));
      if (
        file.length !== artifact.byte_size ||
        createHash('sha256').update(file).digest('hex') !== artifact.sha256
      )
        throw Error('BACKUP_ARTIFACT_INTEGRITY');
      mkdirSync(dirname(resolve(destination, 'artifacts', artifact.storage_key)), {
        recursive: true,
      });
      copyFileSync(
        resolve(artifactRoot, artifact.storage_key),
        resolve(destination, 'artifacts', artifact.storage_key),
      );
    }
    const manifest = {
      protocol: 'agentrouter/1.0',
      created_at: new Date().toISOString(),
      credentialsIncluded: false,
      artifacts,
    };
    writeFileSync(resolve(destination, 'manifest.json'), JSON.stringify(manifest, null, 2));
    return manifest;
  } finally {
    snapshot.close();
  }
}
export function verifyBackup(destination: string) {
  const manifest = JSON.parse(readFileSync(resolve(destination, 'manifest.json'), 'utf8'));
  if (manifest.protocol !== 'agentrouter/1.0' || manifest.credentialsIncluded !== false)
    throw Error('BACKUP_PROTOCOL');
  const db = openSnapshot(resolve(destination, 'router.db'));
  try {
    const records = db
      .prepare("select storage_key,sha256,byte_size from artifacts where state='AVAILABLE'")
      .all() as { storage_key: string; sha256: string; byte_size: number }[];
    if (records.length !== manifest.artifacts.length) throw Error('BACKUP_MANIFEST_MISMATCH');
    for (const record of records) {
      if (!/^(?:project_[A-Za-z0-9_-]+\/)?[a-f0-9]{64}$/.test(record.storage_key))
        throw Error('INVALID_STORAGE_KEY');
      const file = readFileSync(resolve(destination, 'artifacts', record.storage_key));
      if (
        file.length !== record.byte_size ||
        createHash('sha256').update(file).digest('hex') !== record.sha256
      )
        throw Error('BACKUP_ARTIFACT_INTEGRITY');
    }
    return { status: 'PASS', artifacts: records.length, accountReloginRequired: true };
  } finally {
    db.close();
  }
}
