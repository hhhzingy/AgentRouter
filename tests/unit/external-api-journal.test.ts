import { afterEach, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdirSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createExternalApiJournal } from '../../packages/storage/external-api-journal.js';
import { openApplicationStore } from '../../packages/storage/application-store.js';
const hashes = ['a'.repeat(64), 'b'.repeat(64)];
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn();
});
function fixture() {
  mkdirSync('.local/api-journal-tests', { recursive: true });
  const root = mkdtempSync(resolve('.local/api-journal-tests/case-')),
    path = join(root, 'test.db');
  const connections: Database.Database[] = [];
  const open = () => {
    const db = new Database(path);
    db.pragma('journal_mode=WAL');
    connections.push(db);
    return db;
  };
  const db = open();
  db.exec(
    "CREATE TABLE external_api_calls(principal TEXT NOT NULL,client_id TEXT NOT NULL,operation_id TEXT NOT NULL,fingerprint TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN('IN_FLIGHT','SUCCEEDED','UNKNOWN')),result_json TEXT,created_at_ms INTEGER NOT NULL,updated_at_ms INTEGER NOT NULL,PRIMARY KEY(principal,client_id,operation_id))",
  );
  cleanup.push(() => {
    for (const db of connections) if (db.open) db.close();
    rmSync(root, { recursive: true });
  });
  return { db, open };
}
it('retains in-flight and settled results across actual database reopen', async () => {
  const f = fixture();
  const first = createExternalApiJournal(f.db, 'owner', 'client');
  expect(await first.claim('pending', hashes[0])).toEqual({ acquired: true });
  await first.claim('complete', hashes[0]);
  await first.settle('complete', hashes[0], { state: 'SUCCEEDED', output: { answer: '42' } });
  f.db.close();
  const next = createExternalApiJournal(f.open(), 'owner', 'client');
  expect(await next.claim('pending', hashes[0])).toEqual({
    acquired: false,
    fingerprint: hashes[0],
  });
  expect(await next.claim('complete', hashes[0])).toEqual({
    acquired: false,
    fingerprint: hashes[0],
    result: { state: 'SUCCEEDED', output: { answer: '42' } },
  });
});
it('two connections claim once and scope records to principal and client', async () => {
  const f = fixture(),
    other = f.open();
  const a = createExternalApiJournal(f.db, 'owner', 'client'),
    b = createExternalApiJournal(other, 'owner', 'client');
  const results = await Promise.all([a.claim('same', hashes[0]), b.claim('same', hashes[0])]);
  expect(results.filter((r) => r.acquired)).toHaveLength(1);
  expect(await createExternalApiJournal(other, 'other', 'client').claim('same', hashes[0])).toEqual(
    { acquired: true },
  );
  expect(await createExternalApiJournal(other, 'owner', 'other').claim('same', hashes[0])).toEqual({
    acquired: true,
  });
  expect((f.db.prepare('select count(*) n from external_api_calls').get() as any).n).toBe(3);
});
it('does not overwrite conflicting claims or reacquire after settle failure', async () => {
  const f = fixture(),
    journal = createExternalApiJournal(f.db, 'owner', 'client');
  await journal.claim('same', hashes[0]);
  expect(await journal.claim('same', hashes[1])).toEqual({
    acquired: false,
    fingerprint: hashes[0],
  });
  await expect(journal.settle('same', hashes[1], { state: 'UNKNOWN' })).rejects.toThrow(
    'API_JOURNAL_SETTLE_CONFLICT',
  );
  expect(await journal.claim('same', hashes[0])).toEqual({
    acquired: false,
    fingerprint: hashes[0],
  });
  f.db.exec(
    "CREATE TRIGGER fail_settle BEFORE UPDATE ON external_api_calls BEGIN SELECT RAISE(ABORT,'injected storage failure'); END",
  );
  await expect(
    journal.settle('same', hashes[0], { state: 'SUCCEEDED', output: {} }),
  ).rejects.toThrow('injected storage failure');
  expect(await journal.claim('same', hashes[0])).toEqual({
    acquired: false,
    fingerprint: hashes[0],
  });
  f.db.exec('DROP TRIGGER fail_settle');
  await journal.settle('same', hashes[0], { state: 'UNKNOWN' });
  await expect(
    journal.settle('same', hashes[0], { state: 'SUCCEEDED', output: {} }),
  ).rejects.toThrow('API_JOURNAL_SETTLE_CONFLICT');
  expect(await journal.claim('same', hashes[0])).toEqual({
    acquired: false,
    fingerprint: hashes[0],
    result: { state: 'UNKNOWN' },
  });
});

it('migrates a v3 database with a recoverable backup and preserves durable claims on reopen', async () => {
  mkdirSync('.local/api-journal-tests', { recursive: true });
  const root = mkdtempSync(resolve('.local/api-journal-tests/migration-'));
  let db = openApplicationStore(root);
  cleanup.push(() => {
    if (db.open) db.close();
    rmSync(root, { recursive: true });
  });
  db.exec(
    'DROP TABLE participant_bindings; DROP TABLE work_session_slots; DROP TABLE context_transfer_ops; DROP TABLE remote_pairings; DROP TABLE remote_devices; DROP TABLE role_context_sync_receipts; DROP TABLE role_session_context_state; DROP TABLE role_context_entries; DROP TABLE role_context_heads; DROP TABLE role_session_activations; DROP INDEX IF EXISTS runs_activation; ALTER TABLE runs DROP COLUMN activation_id; DROP TABLE role_session_handoffs; DROP TABLE external_api_calls; DROP TABLE participant_grants; DROP TABLE role_sessions; ALTER TABLE tasks DROP COLUMN role_session_id; ALTER TABLE runs DROP COLUMN role_session_id; ALTER TABLE conversation_items DROP COLUMN role_session_id; ALTER TABLE runs DROP COLUMN execution_provenance; ALTER TABLE execution_profiles DROP COLUMN fallback_json; DELETE FROM schema_migrations WHERE version>=4;',
  );
  const dataset = db.prepare("select value from app_meta where key='dataset_id'").get();
  db.close();
  db = openApplicationStore(root);
  expect(db.prepare('select max(version) v from schema_migrations').get()).toEqual({ v: 17 });
  expect(db.prepare("select value from app_meta where key='dataset_id'").get()).toEqual(dataset);
  const backupFile = readdirSync(join(root, 'backups')).find((n) => n.startsWith('before-v4-'))!;
  const backup = new Database(join(root, 'backups', backupFile), { readonly: true });
  try {
    expect(backup.prepare('select max(version) v from schema_migrations').get()).toEqual({ v: 3 });
  } finally {
    backup.close();
  }
  await createExternalApiJournal(db, 'owner', 'client').claim('interrupted', hashes[0]);
  db.close();
  db = openApplicationStore(root);
  expect(
    await createExternalApiJournal(db, 'owner', 'client').claim('interrupted', hashes[0]),
  ).toEqual({ acquired: false, fingerprint: hashes[0] });
});
