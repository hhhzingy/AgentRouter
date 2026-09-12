import { it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
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
  ]);
  db.close();
  db = openApplicationStore(dir);
  expect(db.prepare("select value from app_meta where key='dataset_id'").get()).toEqual(id);
  expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
  db.close();
});

it('001 升级前备份，校验和损坏拒绝打开且不重建数据', () => {
  mkdirSync('.local/w11-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/w11-tests/migration-'));
  const old = openStore(resolve(dir, 'router.db'));
  old.close();
  const db = openApplicationStore(dir);
  expect(readdirSync(resolve(dir, 'backups')).length).toBe(1);
  const id = db.prepare("select value from app_meta where key='dataset_id'").get();
  db.prepare("update schema_migrations set checksum='invalid' where version=2").run();
  db.close();
  const before = readFileSync(resolve(dir, 'router.db'));
  expect(() => openApplicationStore(dir)).toThrow('MIGRATION_MISMATCH_DIAGNOSTIC_ONLY');
  expect(readFileSync(resolve(dir, 'router.db'))).toEqual(before);
  expect(id).toBeDefined();
});
