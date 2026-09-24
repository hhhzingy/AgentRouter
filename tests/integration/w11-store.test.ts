import { it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { openStore } from '../../packages/storage/index.ts';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
it('W11 增量迁移可重复打开，旧 baseline 不改，真实 SQLite 持久事实', () => {
  mkdirSync('.local/w11-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/w11-tests/store-'));
  let db = openApplicationStore(dir);
  const id = db.prepare("select value from app_meta where key='dataset_id'").get();
  expect(db.prepare('select version from schema_migrations order by version').all()).toEqual([
    { version: 1 },
    { version: 2 },
    { version: 3 },
    { version: 4 },
    { version: 5 },
    { version: 6 },
    { version: 7 },
    { version: 8 },
    { version: 9 },
    { version: 10 },
    { version: 11 },
    { version: 12 },
    { version: 13 },
    { version: 14 },
    { version: 15 },
    { version: 16 },
    { version: 17 },
    { version: 18 },
    { version: 19 },
    { version: 20 },
  ]);
  db.close();
  db = openApplicationStore(dir);
  expect(db.prepare("select value from app_meta where key='dataset_id'").get()).toEqual(id);
  expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
  db.close();
});

it('v19 升级到 v20 前保留可恢复备份，升级后新证据表存在', () => {
  mkdirSync('.local/w11-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/w11-tests/store-v19-'));
  let db = openApplicationStore(dir);
  const dataset = db.prepare("select value from app_meta where key='dataset_id'").get();
  db.exec('DROP TABLE result_evidence_attestations; DELETE FROM schema_migrations WHERE version=20');
  db.close();
  db = openApplicationStore(dir);
  expect(db.prepare('select max(version) as v from schema_migrations').get()).toEqual({ v: 20 });
  expect(db.prepare("select value from app_meta where key='dataset_id'").get()).toEqual(dataset);
  expect(db.prepare("select name from sqlite_master where type='table' and name='result_evidence_attestations'").get()).toBeTruthy();
  const backupName = readdirSync(resolve(dir, 'backups')).find((name) => name.startsWith('before-v20-'));
  expect(backupName).toBeTruthy();
  const backup = new Database(resolve(dir, 'backups', backupName!), { readonly: true });
  expect(backup.prepare('select max(version) as v from schema_migrations').get()).toEqual({ v: 19 });
  expect(backup.prepare("select value from app_meta where key='dataset_id'").get()).toEqual(dataset);
  backup.close();
  db.close();
});

it('001 升级前备份，校验和损坏拒绝打开且不重建数据', () => {
  mkdirSync('.local/w11-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/w11-tests/migration-'));
  const old = openStore(resolve(dir, 'router.db'));
  old.close();
  const db = openApplicationStore(dir);
  expect(readdirSync(resolve(dir, 'backups')).length).toBe(4);
  const id = db.prepare("select value from app_meta where key='dataset_id'").get();
  db.prepare("update schema_migrations set checksum='invalid' where version=2").run();
  db.close();
  const before = readFileSync(resolve(dir, 'router.db'));
  expect(() => openApplicationStore(dir)).toThrow('MIGRATION_MISMATCH_DIAGNOSTIC_ONLY');
  expect(readFileSync(resolve(dir, 'router.db'))).toEqual(before);
  expect(id).toBeDefined();
});
