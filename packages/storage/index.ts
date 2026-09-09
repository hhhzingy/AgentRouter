import { classifySqlite } from './compatibility.ts';
import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
export function openStore(
  path: string,
  migration = new URL('./migrations/001-baseline.sql', import.meta.url),
) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  try {
    const version = (db.prepare('select sqlite_version() as version').get() as { version: string })
      .version;
    const status = classifySqlite(version);
    if (status !== 'VERIFIED') throw new SqliteCompatibilityError(version, status);
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');
    db.pragma('busy_timeout = 5000');
    const sql = readFileSync(migration, 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    if (!db.prepare("select name from sqlite_master where name='schema_migrations'").get())
      db.transaction(() => {
        db.exec(sql);
        db.prepare('insert into schema_migrations values(1,?,?)').run(Date.now(), checksum);
      }).immediate();
    else {
      const rows = db.prepare('select version,checksum from schema_migrations').all() as {
        version: number;
        checksum: string;
      }[];
      if (rows.length !== 1 || rows[0].version !== 1 || rows[0].checksum !== checksum)
        throw Error('MIGRATION_MISMATCH');
    }
    if (
      db.pragma('integrity_check', { simple: true }) !== 'ok' ||
      (db.pragma('foreign_key_check') as unknown[]).length
    )
      throw Error('DATABASE_INTEGRITY');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export class SqliteCompatibilityError extends Error {
  readonly version: string;
  readonly status: 'UNSAFE' | 'DIAGNOSTIC_ONLY';
  constructor(version: string, status: 'UNSAFE' | 'DIAGNOSTIC_ONLY') {
    super(`SQLITE_${status}`);
    this.version = version;
    this.status = status;
  }
}
/** 未验证引擎用此入口只读诊断，不执行迁移、WAL 或调度。 */
export function inspectStore(path: string) {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    db.pragma('query_only = ON');
    const version = (db.prepare('select sqlite_version() as version').get() as { version: string })
      .version;
    return {
      version,
      compatibility: classifySqlite(version),
      integrity: db.pragma('integrity_check', { simple: true }),
    };
  } finally {
    db.close();
  }
}
