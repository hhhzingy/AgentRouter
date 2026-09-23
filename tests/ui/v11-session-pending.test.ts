import { expect, it } from 'vitest';
import { PendingStore } from '../../apps/desktop/workbench/pending.ts';

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) } as unknown as Storage;
}
const identity = { mode: 'LOCAL_CORE' as const, dataId: 'dataset', clientId: 'workbench' };

it('页面重载后保留 WorkSession 命令的请求键、原 revision、preflight 和载荷', () => {
  const storage = memory();
  const store = new PendingStore(storage, identity);
  const params = { role_id: 'role', name: 'new', target_harness: 'pi' };
  const first = store.prepare('roleSession.create', params, 7, {}, 'a'.repeat(64));
  expect(first).toMatchObject({ requestKey: first.operationId, preflightHash: 'a'.repeat(64) });
  store.markUncertain(first.recordId);
  const restored = new PendingStore(storage, identity);
  expect(restored.prepare('roleSession.create', params, 999, {}, 'b'.repeat(64))).toEqual({ ...first, state: 'uncertain' });
  expect(new PendingStore(storage, { ...identity, dataId: 'other' }).list()).toEqual([]);
  expect(new PendingStore(storage, { ...identity, clientId: 'other' }).list()).toEqual([]);
});

it('存储失败时不返回可发送命令；缺少 preflight 时不创建会话记录', () => {
  const storage = memory();
  const store = new PendingStore(storage, identity);
  expect(() => store.prepare('roleSession.switch', { role_id: 'r', session_id: 's' }, 1, {})).toThrow('PREFLIGHT_REQUIRED');
  expect(store.list()).toEqual([]);
  storage.setItem = () => { throw Error('QUOTA_EXCEEDED'); };
  expect(() => store.prepare('roleSession.switch', { role_id: 'r', session_id: 's' }, 1, {}, 'a'.repeat(64))).toThrow('QUOTA_EXCEEDED');
});

it('请求修改结果未知时保留原 operation ID 与反馈，供 reviewStatus 核对',()=>{
  const storage=memory(), store=new PendingStore(storage,identity);
  const params={id:'result_a',feedback:'请补充验收证据'};
  const first=store.prepare('result.requestChanges',params,12,{});
  store.markUncertain(first.recordId);
  const restored=new PendingStore(storage,identity);
  expect(restored.list()[0]).toMatchObject({method:'result.requestChanges',params,operationId:first.operationId,expectedRevision:12,state:'uncertain'});
  expect(restored.prepare('result.requestChanges',params,99,{}).operationId).toBe(first.operationId);
});
