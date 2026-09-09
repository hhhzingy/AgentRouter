import { it, expect } from 'vitest';
import { switchAccount, quotaSnapshot, type SwitchPort } from '../../packages/accounts/index.ts';
it('T054 查询错误与未知额度不当作无限', () => {
  expect(quotaSnapshot({ kind: 'error' }, 1, 2).status).toBe('ERROR');
  expect(quotaSnapshot(null, 1, 2).status).toBe('UNKNOWN');
  expect(quotaSnapshot({ kind: 'success', windows: [] }, 1, 100000).status).toBe('STALE');
});
it('T051 切换阶段失败保留安全暂停，不实现真实凭据覆盖', async () => {
  for (const fail of ['pause', 'stopped', 'snapshotLatest', 'installTarget', 'verifyIdentity']) {
    const states: string[] = [],
      called: string[] = [];
    const action = async (name: string) => {
      called.push(name);
      if (name === fail) throw Error('injected');
    };
    const port: SwitchPort = {
      pause: () => action('pause'),
      stopped: async () => {
        await action('stopped');
        return true;
      },
      snapshotLatest: () => action('snapshotLatest'),
      installTarget: () => action('installTarget'),
      verifyIdentity: async () => {
        await action('verifyIdentity');
        return true;
      },
      record: async (s) => {
        states.push(s);
      },
    };
    expect(await switchAccount(port)).toBe('FAILED_SAFE');
    expect(states.at(-1)).toBe('FAILED_SAFE');
    if (fail === 'stopped') expect(called).not.toContain('installTarget');
  }
});
