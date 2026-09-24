import { it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
it('C1 真实 Node stdio 进程输出合法帧（业务为 Mock，不是 Harness/SSH）', () => {
  const frames = [
    {
      v: 1,
      id: 'req_init',
      method: 'system.initialize',
      params: {
        client_protocol: 'agentrouter-client/1',
        client_version: '1.0.0-dev.0',
        client_id: 'client_process',
        requested_mode: 'observer',
      },
    },
    { v: 1, id: 'req_snapshot', method: 'system.snapshot', params: {} },
  ];
  const r = spawnSync(process.execPath, ['tools/run-c1-mock.mjs'], {
    input: frames.map((f) => JSON.stringify(f) + '\n').join(''),
    encoding: 'utf8',
    timeout: 20000,
    windowsHide: true,
  });
  expect(r.status).toBe(0);
  const replies = r.stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(replies).toHaveLength(2);
  expect(replies[0].result.capabilities.mock).toBe(true);
  expect(replies[1].result.runs[0].state).toBe('UNKNOWN');
}, 25000);
