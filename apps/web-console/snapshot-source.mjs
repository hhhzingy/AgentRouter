// 仅维护观察者连接；失败后重新读取 endpoint 并建立新连接。
export function createSnapshotSource(transport, now = Date.now) {
  let session, cached, pending;
  async function read() {
    try {
      if (!session) {
        session = await transport.connect({ clientId: 'web_console_readonly', clientVersion: '1.0.0-dev.0', requestedMode: 'observer', contractRevision: 'C1R1P1', mode: 'LOCAL_CORE' });
        await session.request('contract.upgrade', { revision: 'C1R1P2' });
      }
      const snapshot = await session.request('system.snapshot', {});
      for (const key of ['projects', 'roles', 'tasks', 'runs']) {
        if (!Array.isArray(snapshot[key])) throw Error('INVALID_SNAPSHOT');
      }
      // 不向浏览器透传 workspace 路径、原生会话引用或模型配置。
      const pick = (items, fields) => items.map(item => Object.fromEntries(fields.map(key => [key, item[key]])));
      cached = { updatedAt: now(), connected: true,
        projects: pick(snapshot.projects, ['id', 'name', 'status']),
        roles: pick(snapshot.roles, ['id', 'name', 'harness', 'bootstrapState']),
        tasks: pick(snapshot.tasks, ['id', 'summary', 'state']),
        runs: pick(snapshot.runs, ['id', 'state']),
      };
      return cached;
    } catch {
      session = undefined;
      cached = undefined;
      try { await transport.close(); } catch { /* 下一次 connect 再尝试连接。 */ }
      throw Error('CORE_UNAVAILABLE');
    }
  }
  return async function snapshot() {
    if (pending) return pending;
    if (cached && now() - cached.updatedAt < 1000) return cached;
    pending = read();
    try { return await pending; } finally { pending = undefined; }
  };
}
