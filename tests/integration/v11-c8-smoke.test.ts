import { it, expect } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { P1MemoryTransport } from '../../packages/client-transport/p1/memory.ts';

const CRED = 'E:/AgentRouter/账号信息/通用API/百炼.txt';
const PROD = {
  kimi: 'C:/Users/hap_p/.kimi-code/session_index.jsonl',
  dsh: 'C:/Users/hap_p/.dsh/sessions',
};

it('C8:在隔离数据根创建 V11-REAL-SMOKE 项目，不改写生产会话与凭据文件', async () => {
  const kimiBefore = existsSync(PROD.kimi) ? statSync(PROD.kimi).mtimeMs : 0;
  const dshBefore = existsSync(PROD.dsh) ? statSync(PROD.dsh).mtimeMs : 0;
  const credBefore = existsSync(CRED) ? statSync(CRED).mtimeMs : 0;

  mkdirSync('.local/w11-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/w11-tests/c8-smoke-'));
  const db = openApplicationStore(dir);
  const server = new ApplicationService(db, [dir], false);
  const transport = new P1MemoryTransport(server, 'human_c8');
  try {
    const s = await transport.connect({
      clientId: 'mcp_management_cursor',
      clientVersion: '1.0.0-dev.0',
      requestedMode: 'controller',
    });
    const snap0 = await s.request('system.snapshot', {});
    const lease = await s.request('control.acquire', {}, {
      operationId: 'c8_lease',
      expectedRevision: snap0.revision,
      scope: {},
    });
    const roots = await s.request('filesystem.listRoots', {});
    const name = 'V11-REAL-SMOKE-' + new Date().toISOString().replace(/[:.]/g, '');
    const project = (await s.request(
      'project.create',
      { name, path_handle: roots.items[0].pathHandle },
      {
        operationId: 'c8_project',
        expectedRevision: (await s.request('system.snapshot', {})).revision,
        scope: {},
        leaseId: (lease as { leaseId: string }).leaseId,
      },
    )) as { id: string; name: string };
    expect(project.name.startsWith('V11-REAL-SMOKE-')).toBe(true);
    const snap = await s.request('system.snapshot', {});
    expect(snap.projects.some((p: { name: string }) => p.name === project.name)).toBe(true);
    expect(dir.replaceAll('\\', '/')).toMatch(/\/\.local\/w11-tests\/c8-smoke-/);
    expect(existsSync(resolve(dir, '百炼.txt'))).toBe(false);
    if (existsSync(CRED)) expect(statSync(CRED).mtimeMs).toBe(credBefore);
    if (existsSync(PROD.kimi)) expect(statSync(PROD.kimi).mtimeMs).toBe(kimiBefore);
    if (existsSync(PROD.dsh)) expect(statSync(PROD.dsh).mtimeMs).toBe(dshBefore);
  } finally {
    await transport.close();
    db.close();
  }
});

it.skipIf(!existsSync(resolve('.local/v11-c7-dut/native-runtime.json')))(
  'C8:隔离 DUT native-runtime 不把生产 Kimi/DSH HOME 写成 sessionHome',
  () => {
  const cfgPath = resolve('.local/v11-c7-dut/native-runtime.json');
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as {
    profiles: { harness: string; sessionHome: string }[];
    credentialFile: string;
  };
  expect(cfg.credentialFile.replaceAll('\\', '/')).toBe(CRED);
  for (const p of cfg.profiles) {
    expect(p.sessionHome.replaceAll('\\', '/')).not.toContain('/.kimi-code');
    expect(p.sessionHome.replaceAll('\\', '/')).not.toContain('/.dsh');
    expect(p.sessionHome.replaceAll('\\', '/')).not.toContain('/.codex');
  }
  },
);
