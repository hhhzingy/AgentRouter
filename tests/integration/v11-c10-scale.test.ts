import { it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { P1MemoryTransport } from '../../packages/client-transport/p1/memory.ts';
import { freezeFile } from '../../packages/artifacts/index.ts';
import seed from '../../fixtures/client-c1r1/two-groups.plan.json' with { type: 'json' };
import type { RolePlanInput } from '../../packages/client-contract/c1r1p1/index.ts';

function rssKb() {
  try {
    const out = execFileSync(
      resolve(process.env.WINDIR ?? 'C:/Windows', 'System32/tasklist.exe'),
      ['/FI', 'PID eq ' + process.pid, '/FO', 'CSV', '/NH'],
      { encoding: 'utf8', windowsHide: true },
    );
    const m = out.match(/"([\d,.]+) K"/);
    return m ? Number(m[1].replaceAll(/[,.]/g, '')) : null;
  } catch {
    return null;
  }
}

it('C10:100/1k/10k conversation 项、20MiB 分块读取、二次连接 snapshot 仍合法', { timeout: 120000 }, async () => {
  mkdirSync('.local/w11-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/w11-tests/c10-scale-'));
  const db = openApplicationStore(dir);
  const server = new ApplicationService(db, [dir], false);
  const t1 = new P1MemoryTransport(server, 'human_c10');
  const rss0 = rssKb();
  const latencies: number[] = [];
  try {
    const s = await t1.connect({
      clientId: 'client_c10',
      clientVersion: '1.0.0-dev.0',
      requestedMode: 'controller',
    });
    const snap0 = await s.request('system.snapshot', {});
    const lease = await s.request('control.acquire', {}, {
      operationId: 'c10_lease',
      expectedRevision: snap0.revision,
      scope: {},
    });
    const roots = await s.request('filesystem.listRoots', {});
    const t0 = Date.now();
    const project = (await s.request(
      'project.create',
      { name: 'C10规模', path_handle: roots.items[0].pathHandle },
      {
        operationId: 'c10_project',
        expectedRevision: (await s.request('system.snapshot', {})).revision,
        scope: {},
        leaseId: (lease as { leaseId: string }).leaseId,
      },
    )) as { id: string };
    latencies.push(Date.now() - t0);
    const ws = await s.request('workspace.list', { project_id: project.id });
    const plan = structuredClone(seed) as RolePlanInput;
    plan.project_id = project.id;
    for (const g of plan.groups) g.workspace_ref = ws.items[0].id;
    for (const r of plan.roles) r.workspace_ref = ws.items[0].id;
    const v = await s.request('rolePlan.validate', { plan });
    await s.request(
      'rolePlan.apply',
      { plan, plan_hash: v.planHash, confirmed: true, permission_grants: [] },
      {
        operationId: 'c10_plan',
        expectedRevision: (await s.request('system.snapshot', {})).revision,
        scope: { project_id: project.id },
        leaseId: (lease as { leaseId: string }).leaseId,
      },
    );
    const spaces = db.prepare('select id from spaces where project_id=?').all(project.id) as { id: string }[];
    const spaceId = spaces[0]?.id;
    expect(spaceId).toBeTruthy();
    expect(spaces.length).toBeGreaterThan(1);

    const insert = db.prepare(
      'insert into conversation_items(id,project_id,space_id,kind,title,body,state,at_ms,source_key) values(?,?,?,?,?,?,?,?,?)',
    );
    const now = Date.now();
    const sizes = [100, 1000, 10000];
    let seq = 0;
    const counts: Record<number, { ms: number; n: number }> = {};
    for (const n of sizes) {
      const start = Date.now();
      const tx = db.transaction(() => {
        while (seq < n) {
          seq++;
          insert.run(
            'c10_' + seq,
            project.id,
            spaceId,
            'NOTICE',
            'item ' + seq,
            'scale-body-' + seq,
            null,
            now,
            'src_' + seq,
          );
        }
      });
      tx();
      const tSnap = Date.now();
      const snap = await s.request('system.snapshot', {});
      latencies.push(Date.now() - tSnap);
      expect(snap.projects[0].id).toBe(project.id);
      const counted = db.prepare('select count(*) n from conversation_items where project_id=?').get(project.id) as {
        n: number;
      };
      expect(counted.n).toBeGreaterThanOrEqual(n);
      expect(seq).toBe(n);
      counts[n] = { ms: Date.now() - start, n };
    }

    writeFileSync(resolve(dir, 'blob.bin'), Buffer.alloc(20 * 1024 * 1024, 7));
    const frozen = freezeFile(dir, 'blob.bin', resolve(dir, 'artifacts'));
    db.prepare(
      "insert into artifacts(id,project_id,storage_key,sha256,byte_size,media_type,source_json,state,created_at_ms) values(?,?,?,?,?,?,?, 'AVAILABLE',?)",
    ).run(
      'art_c10_20m',
      project.id,
      frozen.storage_key,
      frozen.sha256,
      frozen.byte_size,
      'application/octet-stream',
      JSON.stringify({ kind: 'file', name: 'blob.bin' }),
      now,
    );
    const first = (await s.request('artifact.download', {
      id: 'art_c10_20m',
      offset_bytes: 0,
      limit_bytes: 65536,
    })) as { byteSize: number; hasMore: boolean };
    const mid = (await s.request('artifact.download', {
      id: 'art_c10_20m',
      offset_bytes: 10 * 1024 * 1024,
      limit_bytes: 65536,
    })) as { byteSize: number; hasMore: boolean };
    const last = (await s.request('artifact.download', {
      id: 'art_c10_20m',
      offset_bytes: 20 * 1024 * 1024 - 4096,
      limit_bytes: 65536,
    })) as { byteSize: number; hasMore: boolean };
    expect(first.byteSize).toBe(65536);
    expect(first.hasMore).toBe(true);
    expect(mid.byteSize).toBe(65536);
    expect(mid.hasMore).toBe(true);
    expect(last.byteSize).toBe(4096);
    expect(last.hasMore).toBe(false);

    await t1.close();
    const t2 = new P1MemoryTransport(server, 'human_c10');
    const s2 = await t2.connect({
      clientId: 'client_c10_re',
      clientVersion: '1.0.0-dev.0',
      requestedMode: 'controller',
    });
    const tRe = Date.now();
    const snap2 = await s2.request('system.snapshot', {});
    latencies.push(Date.now() - tRe);
    expect(snap2.projects.some((p: { id: string }) => p.id === project.id)).toBe(true);
    expect(snap2.revision).toBeGreaterThan(0);
    await t2.close();

    const rss1 = rssKb();
    const p95 = [...latencies].sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)] ?? 0;
    expect(p95).toBeLessThan(30_000);
    if (rss0 && rss1) expect(rss1).toBeLessThan(rss0 + 512 * 1024);
    expect(counts[10000].ms).toBeLessThan(60_000);
  } finally {
    db.close();
  }
});

it('C10:migration freeze 与当前 SQL 字节一致', () => {
  const out = execFileSync(process.execPath, [resolve('tools/check-migrations.mjs')], {
    encoding: 'utf8',
    windowsHide: true,
  });
  expect(out).toMatch(/PASS/);
});
