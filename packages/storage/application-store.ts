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
    const sources = ['001-baseline.sql', '002-w11-application.sql', '003-native-execution.sql', '004-external-api-journal.sql', '005-role-sessions.sql', '006-role-harness-dynamic.sql', '007-restore-current-binding-index.sql', '008-participant-grants.sql', '009-role-session-handoffs.sql', '010-run-provenance.sql', '011-work-session-continuity.sql', '012-role-context-index.sql', '013-remote-devices.sql', '014-context-convergence.sql'].map((name) =>
      readFileSync(new URL(name, migrations), 'utf8'),
    );
    const hashes = sources.map((sql) => createHash('sha256').update(sql).digest('hex'));
    if (
      rows.some((r, i) => r.version !== i + 1 || hashes[i] !== r.checksum) ||
      rows.length < 1 ||
      rows.length > sources.length
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
    if (rows.length < 3) {
      if (existed && rows.length === 2) {
        const backups = resolve(data, 'backups');
        mkdirSync(backups, { recursive: true });
        db.prepare('VACUUM INTO ?').run(resolve(backups, 'before-v3-' + randomUUID() + '.db'));
      }
      // SQLite table rebuild requires FK OFF outside the transaction; check before commit.
      db.pragma('foreign_keys=OFF');
      try {
        db.transaction(() => {
          db.exec(sources[2]);
          if ((db.pragma('foreign_key_check') as unknown[]).length)
            throw Error('MIGRATION_FOREIGN_KEY_FAILURE');
          db.prepare('insert into schema_migrations values(3,?,?)').run(Date.now(), hashes[2]);
        }).immediate();
      } finally {
        db.pragma('foreign_keys=ON');
      }
    }
    if (rows.length < 4) {
      if (existed && rows.length === 3) {
        const backups = resolve(data, 'backups');
        mkdirSync(backups, { recursive: true });
        db.prepare('VACUUM INTO ?').run(resolve(backups, 'before-v4-' + randomUUID() + '.db'));
      }
      db.transaction(() => {
        db.exec(sources[3]);
        db.prepare('insert into schema_migrations values(4,?,?)').run(Date.now(), hashes[3]);
      }).immediate();
    }
    if (rows.length < 5) {
      if (existed && rows.length === 4) {
        const backups = resolve(data, 'backups');
        mkdirSync(backups, { recursive: true });
        db.prepare('VACUUM INTO ?').run(resolve(backups, 'before-v5-' + randomUUID() + '.db'));
      }
      db.transaction(() => {
        db.exec(sources[4]);
        db.prepare('insert into schema_migrations values(5,?,?)').run(Date.now(), hashes[4]);
      }).immediate();
    }
    if (rows.length < 6) {
      if (existed && rows.length === 5) {
        const backups = resolve(data, 'backups');
        mkdirSync(backups, { recursive: true });
        db.prepare('VACUUM INTO ?').run(resolve(backups, 'before-v6-' + randomUUID() + '.db'));
      }
      // 006 重建含 FK 引用的表:PRAGMA foreign_keys 在事务内是 no-op,须事务外切换;
      // 事务内完成重建并在提交前做 FK 检查,失败整体回滚且不记录版本。
      db.pragma('foreign_keys=OFF');
      try {
        db.transaction(() => {
          db.exec(sources[5]);
          if ((db.pragma('foreign_key_check') as unknown[]).length)
            throw Error('MIGRATION_FOREIGN_KEY_FAILURE');
          db.prepare('insert into schema_migrations values(6,?,?)').run(Date.now(), hashes[5]);
        }).immediate();
      } finally {
        db.pragma('foreign_keys=ON');
      }
    }
    if (rows.length < 7) {
      // 007 恢复 006 丢失的单一当前绑定唯一索引;存量冲突则 CREATE 失败并回滚版本记录(不自动挑选/删除)。
      db.transaction(() => {
        db.exec(sources[6]);
        db.prepare('insert into schema_migrations values(7,?,?)').run(Date.now(), hashes[6]);
      }).immediate();
    }
    if (rows.length < 8) {
      db.transaction(() => {
        db.exec(sources[7]);
        db.prepare('insert into schema_migrations values(8,?,?)').run(Date.now(), hashes[7]);
      }).immediate();
    }
    if (rows.length < 9) {
      db.transaction(() => {
        db.exec(sources[8]);
        db.prepare('insert into schema_migrations values(9,?,?)').run(Date.now(), hashes[8]);
      }).immediate();
    }
    if (rows.length < 10) {
      db.transaction(() => {
        db.exec(sources[9]);
        db.prepare('insert into schema_migrations values(10,?,?)').run(Date.now(), hashes[9]);
      }).immediate();
    }
    if (rows.length < 11) {
      if (existed) {
        const backups = resolve(data, 'backups');
        mkdirSync(backups, { recursive: true });
        db.prepare('VACUUM INTO ?').run(resolve(backups, 'before-v11-' + randomUUID() + '.db'));
      }
      db.transaction(() => {
        db.exec(sources[10]);
        if ((db.pragma('foreign_key_check') as unknown[]).length)
          throw Error('MIGRATION_FOREIGN_KEY_FAILURE');
        db.prepare('insert into schema_migrations values(11,?,?)').run(Date.now(), hashes[10]);
      }).immediate();
    }
    if (rows.length < 12) {
      if (existed) {
        const backups = resolve(data, 'backups');
        mkdirSync(backups, { recursive: true });
        db.prepare('VACUUM INTO ?').run(resolve(backups, 'before-v12-' + randomUUID() + '.db'));
      }
      db.transaction(() => {
        db.exec(sources[11]);
        if ((db.pragma('foreign_key_check') as unknown[]).length)
          throw Error('MIGRATION_FOREIGN_KEY_FAILURE');
        db.prepare('insert into schema_migrations values(12,?,?)').run(Date.now(), hashes[11]);
      }).immediate();
    }
    if (rows.length < 13) {
      db.transaction(() => {
        db.exec(sources[12]);
        if ((db.pragma('foreign_key_check') as unknown[]).length)
          throw Error('MIGRATION_FOREIGN_KEY_FAILURE');
        db.prepare('insert into schema_migrations values(13,?,?)').run(Date.now(), hashes[12]);
      }).immediate();
    }
    if (rows.length < 14) {
      db.transaction(() => {
        db.exec(sources[13]);
        if ((db.pragma('foreign_key_check') as unknown[]).length)
          throw Error('MIGRATION_FOREIGN_KEY_FAILURE');
        db.prepare('insert into schema_migrations values(14,?,?)').run(Date.now(), hashes[13]);
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
