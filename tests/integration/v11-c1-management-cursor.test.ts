import { it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { P1MemoryTransport } from '../../packages/client-transport/p1/memory.ts';
import { ManagementGateway } from '../../packages/management-gateway/index.ts';
import { visibleManagementTools } from '../../apps/management-mcp/launcher-guard.ts';

it('C1 DUT observer: mcp_management_cursor 只读接入且不创建 Cursor Role', async () => {
  mkdirSync('.local/w11-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/w11-tests/c1-cursor-'));
  const db = openApplicationStore(dir);
  const app = new ApplicationService(db, [dir], false);
  const admin = new P1MemoryTransport(app, 'human_local');
  const a = await admin.connect({ clientId: 'admin', clientVersion: '1.0.0-dev.0', requestedMode: 'controller' });
  const snap0 = await a.request('system.snapshot', {});
  const lease = await a.request('control.acquire', {}, { operationId: 'al', expectedRevision: snap0.revision, scope: {} });
  const roots = await a.request('filesystem.listRoots', {});
  await a.request(
    'project.create',
    { name: 'C1-DUT', path_handle: roots.items[0].pathHandle },
    { operationId: 'p1', expectedRevision: (await a.request('system.snapshot', {})).revision, scope: {}, leaseId: (lease as { leaseId: string }).leaseId },
  );
  await a.request(
    'control.release',
    { lease_id: (lease as { leaseId: string }).leaseId },
    { operationId: 'arelease', expectedRevision: (await a.request('system.snapshot', {})).revision, scope: {} },
  );
  admin.close?.();

  const transport = new P1MemoryTransport(app, 'human_' + 'e'.repeat(24));
  const gateway = new ManagementGateway(transport, 'observer', 'mcp_management_cursor');
  try {
    await gateway.connect();
    const names = gateway.tools().map((t) => t.name);
    expect(names).toContain('router_status');
    expect(names).toContain('router_projects');
    expect(names).not.toContain('router_plan_apply');
    expect(names).not.toContain('router_task_dispatch');
    expect(names).not.toContain('router_control_acquire');
    const status = (await gateway.call('router_status')) as {
      snapshot: { projects: { name: string }[]; roles: { name: string }[] };
      hello: { clientId?: string };
    };
    expect(status.snapshot.projects.some((p) => p.name === 'C1-DUT')).toBe(true);
    expect(status.snapshot.roles.every((r) => !/cursor/i.test(r.name))).toBe(true);
    await expect(
      gateway.call('router_plan_apply', { params: {}, request_key: 'x', expected_revision: 1 }),
    ).rejects.toThrow('TOOL_UNAVAILABLE');
  } finally {
    await gateway.close();
    db.close();
  }
});

it('C1: 示例 MCP 配置把 Cursor 固定为 Management 客户端而非 Role', () => {
  const cfg = JSON.parse(readFileSync('.cursor/mcp.example.json', 'utf8')) as {
    mcpServers: { 'agentrouter-management': { args: string[] } };
    _comment: string;
  };
  const args = cfg.mcpServers['agentrouter-management'].args;
  expect(args).toContain('observer');
  expect(args).toContain('mcp_management_cursor');
  expect(cfg._comment).toMatch(/not a Role/i);
  expect(JSON.stringify(cfg)).not.toMatch(/sk-|api[_-]?key|BAILIAN|DASHSCOPE/i);
});

it('N5: Management MCP observer 工具面只读；Slot 工具存在且无历史 WS resume/switch 工具', () => {
  const definitions = [
    { name: 'read', annotations: { readOnlyHint: true } },
    { name: 'write', annotations: { readOnlyHint: false } },
  ];
  expect(visibleManagementTools(definitions, 'observer').map((x) => x.name)).toEqual(['read']);
  expect(visibleManagementTools(definitions, 'controller').map((x) => x.name)).toEqual([
    'read',
    'write',
  ]);
  const source = readFileSync('apps/management-mcp/main.ts', 'utf8');
  expect(source).toContain("name: 'router_participant_slot_list'");
  expect(source).toContain("name: 'router_participant_slot_create'");
  expect(source).toContain("name: 'router_participant_slot_leave'");
  expect(source).not.toContain("name: 'router_role_session_switch'");
});
