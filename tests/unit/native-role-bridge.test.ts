import { expect, test } from 'vitest';
import { request } from 'node:http';
import { createNativeRoleBridge } from '../../packages/role-bridge/native-server.ts';

test('真实 loopback 只按令牌进入可信角色闭包，撤销后拒绝调用', async () => {
  const bridge = await createNativeRoleBridge();
  const seen: unknown[] = [];
  const a = bridge.issue(async (tool, operation, input) => {
    seen.push([tool, operation, input]);
    return { role: 'A' };
  });
  const b = bridge.issue(async () => ({ role: 'B' }));
  const call = (
    token: string,
    body: unknown = { tool: 'route_context', operation_id: 'op1', input: {} },
    headers = {},
  ) =>
    fetch(bridge.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  try {
    expect(await (await call(a)).json()).toEqual({ result: { role: 'A' } });
    expect(await (await call(b)).json()).toEqual({ result: { role: 'B' } });
    expect(
      (await call(a, { tool: 'route_context', operation_id: 'op1', input: {}, role_id: 'B' }))
        .status,
    ).toBe(400);
    expect(
      (await call(a, { tool: 'route_context', operation_id: 'op1', input: { role_id: 'B' } }))
        .status,
    ).toBe(400);
    expect((await call(a, undefined, { Origin: 'http://localhost' })).status).toBe(403);
    const wrongHost = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(
        bridge.endpoint,
        { method: 'POST', headers: { Host: 'example.com' } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on('error', reject);
      req.end();
    });
    expect(wrongHost).toBe(403);
    expect((await call('invalid')).status).toBe(401);
    expect((await call(a, { tool: 'router_status', operation_id: 'op1', input: {} })).status).toBe(
      400,
    );
    expect((await call(a, { tool: 'route_send', operation_id: 'op1', input: {} })).status).toBe(
      400,
    );
    expect(
      (
        await call(a, {
          tool: 'route_context',
          operation_id: 'op1',
          input: { padding: 'x'.repeat(262144) },
        })
      ).status,
    ).toBe(413);
    expect((await fetch(bridge.endpoint)).status).toBe(403);
    bridge.revoke(a);
    expect((await call(a)).status).toBe(401);
    expect(seen).toHaveLength(1);
  } finally {
    await bridge.close();
  }
  expect(() => bridge.issue(async () => null)).toThrow('BRIDGE_CLOSED');
});

test('处理器失败不泄漏秘密、不重试，保留未知副作用标记', async () => {
  const bridge = await createNativeRoleBridge();
  let calls = 0;
  const token = bridge.issue(async () => {
    calls++;
    throw Error('private-account-secret');
  });
  try {
    const response = await fetch(bridge.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'route_context', operation_id: 'stable-key', input: {} }),
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'BRIDGE_HANDLER_FAILED', unknownOutcome: true });
    expect(calls).toBe(1);
  } finally {
    await bridge.close();
  }
});
