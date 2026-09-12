import { it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import Database from 'better-sqlite3';

it(
  'P3 Participant MCP:收件箱只读+产物原子落盘(sha/大小/事件)+越权拒绝',
  { timeout: 90000 },
  async () => {
    mkdirSync('.local/w11-tests', { recursive: true });
    const dir = mkdtempSync(resolve('.local/w11-tests/part-'));
    mkdirSync(resolve(dir, 'workspace'), { recursive: true });
    const core = spawn(process.execPath, [resolve('.local/w11-core/core.mjs')], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: {
        SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: '', TEMP: dir, TMP: dir,
        AGENTROUTER_DATA: resolve(dir, 'core'),
        AGENTROUTER_PROJECT_ROOTS: JSON.stringify([resolve(dir, 'workspace')]),
      },
    });
    for (let i = 0; i < 60 && !existsSync(resolve(dir, 'core/endpoint.json')); i++)
      await new Promise((r) => setTimeout(r, 100));
    const coreErr: string[] = [];
    core.stderr?.on('data', (d) => coreErr.push(d.toString()));
    await build({
      entryPoints: ['packages/client-transport/p1/local.ts'],
      outfile: resolve(dir, 'transport.mjs'),
      bundle: true, platform: 'node', format: 'esm', packages: 'external',
    });
    // Setup client 建项目+单角色计划
    const { LocalCoreTransport } = await import(pathToFileURL(resolve(dir, 'transport.mjs')).href);
    const setup = new LocalCoreTransport(resolve(dir, 'core'));
    const s = await setup.connect({ clientId: 'p3_setup', clientVersion: '1.0.0', requestedMode: 'controller', contractRevision: 'C1R1P1', mode: 'LOCAL_CORE' });
    const snap = () => s.request('system.snapshot', {});
    const lease = await s.request('control.acquire', {}, { operationId: 'p3_lease', expectedRevision: (await snap()).revision, scope: {} });
    const mutate = async (method: string, params: any, scope: any, op: string) =>
      s.request(method as never, params, { operationId: op, scope, expectedRevision: (await snap()).revision, leaseId: (lease as any).leaseId });
    const roots = await s.request('filesystem.listRoots', {});
    const project = (await mutate('project.create', { name: 'P3产物闭环', path_handle: roots.items[0].pathHandle }, {}, 'project')) as any;
    const ws = (await s.request('workspace.list', { project_id: project.id })).items[0];
    const plan = JSON.parse(readFileSync('fixtures/client-c1r1/two-groups.plan.json', 'utf8'));
    plan.project_id = project.id;
    plan.groups = plan.groups.slice(0, 1);
    plan.roles = plan.roles.slice(0, 1);
    plan.groups[0].workspace_ref = ws.id;
    plan.roles[0].workspace_ref = ws.id;
    const v = await s.request('rolePlan.validate', { plan });
    await mutate('rolePlan.apply', { plan, plan_hash: v.planHash, confirmed: true, permission_grants: [{ role_key: plan.roles[0].role_key, permissions: plan.roles[0].requested_permissions }] }, { project_id: project.id }, 'apply');
    const roleId = ((await s.request('role.list', { scope: { project_id: project.id } })) as any).items[0].id;
    await setup.close();
    // 角色工作区路径(夹具直接读DB:workspace.canonical_path)
    const db = new Database(resolve(dir, 'core/router.db'), { readonly: true });
    const wsPath = (db.prepare('select w.canonical_path from workspaces w join bindings b on b.workspace_id=w.id where b.role_id=? and b.is_current=1').get(roleId) as any).canonical_path;
    db.close();
    // Participant MCP 服务
    await build({
      entryPoints: ['apps/participant-mcp/main.mjs'],
      outfile: resolve(dir, 'participant.mjs'),
      bundle: true, platform: 'node', format: 'esm', packages: 'external',
    });
    const client = new Client({ name: 'p3_participant', version: '1.0.0' });
    // stderr 由 transport 管道缓存;失败时用 client.close 后的 pErr 输出
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [resolve(dir, 'participant.mjs'), resolve(dir, 'core'), roleId as string],
      env: { SystemRoot: process.env.SystemRoot as string, WINDIR: process.env.WINDIR as string, PATH: '', TEMP: dir as string, TMP: dir as string, AGENTROUTER_MANAGED_ROLE: '1' },
      stderr: 'pipe',
    }));
    let pErr = '';
    (client.transport as any)._stderr?.on?.('data', (d: any) => (pErr += d.toString()));
    const call = async (name: string, args: any = {}): Promise<any> => {
      const r = await client.callTool({ name, arguments: args });
      const v = JSON.parse((r.content as { text: string }[])[0].text);
      if (r.isError) throw new Error(v.error);
      return v;
    };
    // 收件箱只读
    let inbox: any;
    try {
      inbox = await call('participant_read_inbox');
    } catch (e) {
      console.log('CORE STDERR AT FAILURE:', JSON.stringify(coreErr.join('')));
      throw e;
    }
    expect(Array.isArray(inbox.items ?? inbox)).toBe(true);
    // 产物原子落盘
    const content = '# P3 产物\n\n由参与者经原子写入。';
    const reg = await call('participant_register_artifact', { params: { role_id: roleId, name: 'review-notes.md', content } });
    expect(reg.sha256).toBe(createHash('sha256').update(content, 'utf8').digest('hex'));
    const artifactDir = resolve(wsPath, 'agentrouter-artifacts');
    expect(existsSync(resolve(artifactDir, 'review-notes.md'))).toBe(true);
    expect(readFileSync(resolve(artifactDir, 'review-notes.md'), 'utf8')).toBe(content);
    // 无残留临时文件
    expect(readdirSync(artifactDir).some((f) => f.endsWith('.tmp'))).toBe(false);
    // Core 登记
    const db2 = new Database(resolve(dir, 'core/router.db'), { readonly: true });
    const row = db2.prepare('select sha256,byte_size,media_type,state from artifacts where id=?').get(reg.artifact_id) as any;
    db2.close();
    expect(row).toMatchObject({ sha256: reg.sha256, byte_size: Buffer.byteLength(content, 'utf8'), media_type: 'text/markdown', state: 'AVAILABLE' });
    // 重名拒绝
    await expect(call('participant_register_artifact', { params: { role_id: roleId, name: 'review-notes.md', content: 'x' } })).rejects.toThrow('PARTICIPANT_NAME_TAKEN');
    // 路径穿越拒绝
    await expect(call('participant_register_artifact', { params: { role_id: roleId, name: '../evil.md', content: 'x' } })).rejects.toThrow('PARTICIPANT_NAME_INVALID');
    // 类型拒绝
    await expect(call('participant_register_artifact', { params: { role_id: roleId, name: 'evil.exe', content: 'x' } })).rejects.toThrow('PARTICIPANT_TYPE_REJECTED');
    if (coreErr.length) console.log('CORE STDERR:', coreErr.join(''));
    await client.close();
    core.kill();
    await new Promise((r) => setTimeout(r, 500));
  },
);
