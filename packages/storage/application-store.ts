import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { openStore } from './index.ts';
import { classifySqlite } from './compatibility.ts';
import seeds from '../../fixtures/client-c1r1/model-seed.json' with { type: 'json' };
/** 调用方先取得 OS 级数据目录独占（Core 的本地 IPC endpoint），再打开写库。 */
export function openApplicationStore(
  data: string,
  migrations = new URL('./migrations/', import.meta.url),
) {
  mkdirSync(data, { recursive: true });
  const file = resolve(data, 'router.db');
  const existed = existsSync(file);
  if (!existed) {
    const first = openStore(file, new URL('001-baseline.sql', migrations));
    first.close();
  }
  const db = new Database(file);
  try {
    if (
      classifySqlite((db.prepare('select sqlite_version() as v').get() as { v: string }).v) !==
      'VERIFIED'
    )
      throw Error('SQLITE_DIAGNOSTIC_ONLY');
    db.pragma('foreign_keys=ON');
    db.pragma('busy_timeout=5000');
    if (
      db.pragma('integrity_check', { simple: true }) !== 'ok' ||
      (db.pragma('foreign_key_check') as unknown[]).length
    )
      throw Error('DATABASE_INTEGRITY_DIAGNOSTIC_ONLY');
    const rows = db
      .prepare('select version,checksum from schema_migrations order by version')
      .all() as { version: number; checksum: string }[];
    const sources = ['001-baseline.sql', '002-w11-application.sql'].map((name) =>
      readFileSync(new URL(name, migrations), 'utf8'),
    );
    const hashes = sources.map((sql) => createHash('sha256').update(sql).digest('hex'));
    if (
      rows.some((r, i) => r.version !== i + 1 || hashes[i] !== r.checksum) ||
      rows.length < 1 ||
      rows.length > 2
    )
      throw Error('MIGRATION_MISMATCH_DIAGNOSTIC_ONLY');
    if (rows.length === 1) {
      if (existed) {
        const backups = resolve(data, 'backups');
        mkdirSync(backups, { recursive: true });
        db.prepare('VACUUM INTO ?').run(resolve(backups, 'before-v2-' + randomUUID() + '.db'));
      }
      db.transaction(() => {
        db.exec(sources[1]);
        db.prepare('insert into schema_migrations values(2,?,?)').run(Date.now(), hashes[1]);
        db.prepare('insert into app_meta values(?,?)').run('dataset_id', 'dataset_' + randomUUID());
        db.prepare('insert into app_meta values(?,?)').run('revision', '1');
        db.prepare('insert into app_meta values(?,?)').run('dispatch_paused', 'false');
        for (const m of seeds)
          db.prepare('insert into model_catalog values(?,?,?)').run(
            m.provider_profile_id,
            m.model_id,
            JSON.stringify(m),
          );
      }).immediate();
    }
    db.pragma('journal_mode=WAL');
    db.pragma('synchronous=FULL');
    return db;
  } catch (e) {
    db.close();
    throw e;
  }
}
