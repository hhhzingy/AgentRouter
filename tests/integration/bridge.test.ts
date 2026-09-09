import { it, expect } from 'vitest';
import { createFixture, request } from '../support.ts';
import { RoleBridge } from '../../packages/role-bridge/server.ts';
it('T073 内部桥拒绝 Origin、错 token 与管理操作，身份来自受控运行', async () => {
  const f = createFixture();
  const bridge = new RoleBridge(f.core);
  try {
    f.core.send(f.core.management('role_c'), 'root', request('role_a'));
    const run = f.dispatch('role_a')!;
    const token = bridge.issue(run.principal);
    const url = await bridge.listen();
    const call = (headers: Record<string, string>, tool = 'route_send') =>
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...headers,
        },
        body: JSON.stringify({ tool, operation_id: 'call', input: request('role_b') }),
      });
    expect((await call({ Origin: 'https://attacker.invalid' })).status).toBe(403);
    expect((await call({ Authorization: 'Bearer bad' })).status).toBe(401);
    expect((await call({}, 'switch_account')).status).toBe(400);
    expect(await (await call({})).json()).toEqual({ result: {} });
    bridge.revoke(token);
    expect((await call({})).status).toBe(401);
  } finally {
    await bridge.close();
    f.close();
  }
});
