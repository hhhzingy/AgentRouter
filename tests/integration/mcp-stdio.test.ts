import { it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { createFixture, request } from '../support.ts';
import { RoleBridge } from '../../packages/role-bridge/server.ts';
import { JsonLfDecoder } from '../../packages/platform/framing.ts';
it('F09/F25 真实 Node stdio MCP 桥：七工具、身份绑定与重复请求去重', async () => {
  const f = createFixture();
  const bridge = new RoleBridge(f.core);
  let child: ReturnType<typeof spawn> | undefined;
  try {
    f.core.send(f.core.management('role_c'), 'root', request('role_a'));
    const run = f.dispatch('role_a')!;
    const endpoint = await bridge.listen();
    const token = bridge.issue(run.principal);
    child = spawn(process.execPath, [resolve('packages/role-bridge/stdio.mjs')], {
      windowsHide: true,
      env: {
        SystemRoot: process.env.SystemRoot,
        AGENTROUTER_BRIDGE_ENDPOINT: endpoint,
        AGENTROUTER_BRIDGE_TOKEN: token,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const decoder = new JsonLfDecoder();
    const pending = new Map<number, (v: any) => void>();
    child.stdout!.on('data', (b) => decoder.push(b).forEach((m) => pending.get(m.id)?.(m)));
    const call = (id: number, method: string, params: unknown = {}) =>
      new Promise<any>((res, rej) => {
        const timer = setTimeout(() => rej(Error('TIMEOUT')), 3000);
        pending.set(id, (v) => {
          clearTimeout(timer);
          pending.delete(id);
          res(v);
        });
        child!.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      });
    expect(
      (await call(1, 'initialize', { protocolVersion: '2025-11-25' })).result.protocolVersion,
    ).toBe('2025-11-25');
    expect((await call(2, 'tools/list')).result.tools).toHaveLength(7);
    const params = { name: 'route_send', arguments: request('role_b') };
    const first = await call(3, 'tools/call', params);
    expect(first.result.content[0].text).toBe('{}');
    expect(await call(3, 'tools/call', params)).toEqual(first);
    expect(f.core.tasks()).toHaveLength(2);
  } finally {
    child?.kill();
    await bridge.close();
    f.close();
  }
});
