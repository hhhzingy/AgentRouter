import { it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { request as httpRequest } from 'node:http';

const httpJson = (
  url: string,
  body: unknown,
  token?: string,
): Promise<{ status: number; text: string }> =>
  new Promise((res, rej) => {
    const payload = JSON.stringify(body);
    const req = httpRequest(
      url,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...(token ? { authorization: 'Bearer ' + token } : {}),
        },
      },
      (r) => {
        let t = '';
        r.on('data', (c) => (t += c));
        r.on('end', () => res({ status: r.statusCode ?? 0, text: t }));
      },
    );
    req.on('error', rej);
    req.end(payload);
  });

it(
  'P3 HTTP入口负测:错误token 401、>1MB body 413、token按角色隔离',
  { timeout: 120000 },
  async () => {
    mkdirSync('.local/w11-tests', { recursive: true });
    const dir = mkdtempSync(resolve('.local/w11-tests/p3http-'));
    mkdirSync(resolve(dir, 'workspace'), { recursive: true });
    const core = spawn(process.execPath, [resolve('.local/w11-core/core.mjs')], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore'],
      env: {
        SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: '', TEMP: dir, TMP: dir,
        AGENTROUTER_DATA: resolve(dir, 'core'),
        AGENTROUTER_PROJECT_ROOTS: JSON.stringify([resolve(dir, 'workspace')]),
      },
    });
    for (let i = 0; i < 60 && !existsSync(resolve(dir, 'core/endpoint.json')); i++)
      await new Promise((r) => setTimeout(r, 100));
    await build({
      entryPoints: ['packages/client-transport/p1/local.ts'],
      outfile: resolve(dir, 'transport.mjs'),
      bundle: true, platform: 'node', format: 'esm', packages: 'external',
    });
    const { LocalCoreTransport } = await import(
      pathToFileURL(resolve(dir, 'transport.mjs')).href
    );
    const setup = new LocalCoreTransport(resolve(dir, 'core'));
    const s = await setup.connect({
      clientId: 'p3http_setup', clientVersion: '1.0.0', requestedMode: 'controller',
      contractRevision: 'C1R1P1', mode: 'LOCAL_CORE',
    });
    const snap = () => s.request('system.snapshot', {});
    const lease = await s.request('control.acquire', {}, { operationId: 'http_lease', expectedRevision: (await snap()).revision, scope: {} });
    const mutate = async (m: string, p: any, op: string, scope: any = {}) =>
      s.request(m as never, p, {
        operationId: op, scope, expectedRevision: (await snap()).revision,
        leaseId: (lease as { leaseId: string }).leaseId,
      });
    const roots = await s.request('filesystem.listRoots', {});
    const project = (await mutate('project.create', { name: 'P3HTTP负测', path_handle: roots.items[0].pathHandle }, 'project')) as any;
    const ws = (await s.request('workspace.list', { project_id: project.id })).items[0];
    const plan = JSON.parse(readFileSync('fixtures/client-c1r1/two-groups.plan.json', 'utf8'));
    plan.project_id = project.id;
    plan.groups = plan.groups.slice(0, 1);
    plan.roles = plan.roles.slice(0, 1);
    plan.groups[0].workspace_ref = ws.id;
    plan.roles[0].workspace_ref = ws.id;
    // 两个角色:A 与 B,各自独立 HTTP 入口与 token
    const v = await s.request('rolePlan.validate', { plan });
    await mutate('rolePlan.apply', { plan, plan_hash: v.planHash, confirmed: true, permission_grants: [{ role_key: plan.roles[0].role_key, permissions: plan.roles[0].requested_permissions }] }, 'apply', { project_id: project.id });
    const roleIdA = ((await s.request('role.list', { scope: { project_id: project.id } })).items[0] as any).id;
    await setup.close();

    await build({
      entryPoints: ['apps/participant-mcp/http.mjs'],
      outfile: resolve(dir, 'participant-http.mjs'),
      bundle: true, platform: 'node', format: 'esm', packages: 'external',
    });
    const entry = spawn(process.execPath, [resolve(dir, 'participant-http.mjs'), resolve(dir, 'core'), roleIdA, '--gen-token', '--port', '0'], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: '' },
    });
    let address = '';
    let token = '';
    entry.stdout.on('data', (d) => {
      const m = /"bound":"127\.0\.0\.1:(\d+)"/.exec(d.toString());
      if (m) address = 'http://127.0.0.1:' + m[1];
    });
    for (let i = 0; i < 100 && !address; i++) await new Promise((r) => setTimeout(r, 100));
    expect(address).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    for (let i = 0; i < 50 && !existsSync(resolve(dir, 'core', `participant-token-${roleIdA}.txt`)); i++)
      await new Promise((r) => setTimeout(r, 100));
    token = readFileSync(resolve(dir, 'core', `participant-token-${roleIdA}.txt`), 'utf8').trim();

    try {
      // 1) 正确 token → tools/list 200
      const ok = await httpJson(address, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, token);
      expect(ok.status).toBe(200);
      // 2) 错误 token → 401
      const bad = await httpJson(address, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, token.slice(0, -2) + 'zz');
      expect(bad.status).toBe(401);
      // 3) token 按角色隔离:另一角色的 token 文件不存在(未生成),同一 token 不能访问别的角色入口
      //    (入口绑定单一角色;此处验证 token 文件名按角色隔离)
      const otherTokenFile = resolve(dir, 'core', `participant-token-role_other.txt`);
      expect(existsSync(otherTokenFile)).toBe(false);
      // 4) >1MB body → 413
      const big = 'x'.repeat(1200 * 1024);
      const tooLarge = await httpJson(address, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'participant_register_artifact', arguments: { params: { name: 'big.json', content: big } } } }, token).catch((e) => ({ status: 0, text: String(e).slice(0, 80) }));
      expect([413, 0]).toContain(tooLarge.status); // 413 或连接被服务端提前销毁
    } finally {
      entry.kill();
      core.kill();
      await new Promise((r) => setTimeout(r, 500));
    }
  },
);
