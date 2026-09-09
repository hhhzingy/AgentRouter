import { openStore } from '../packages/storage/index.ts';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
mkdirSync('.local/probes', { recursive: true });
const dir = mkdtempSync(resolve('.local/probes/db-'));
const db = openStore(resolve(dir, 'test.db'));
const report = {
  at: new Date().toISOString(),
  node: process.version,
  sqlite: db.prepare('select sqlite_version() as version').get(),
  journal_mode: db.pragma('journal_mode', { simple: true }),
  synchronous: db.pragma('synchronous', { simple: true }),
  foreign_keys: db.pragma('foreign_keys', { simple: true }),
  integrity_check: db.pragma('integrity_check', { simple: true }),
  foreign_key_check: db.pragma('foreign_key_check'),
  exit_code: 0,
  scope: '开发机真实 better-sqlite3 加载与数据库探针，非断电/干净目标机认证',
};
db.close();
writeFileSync('evidence/M00/sqlite.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
