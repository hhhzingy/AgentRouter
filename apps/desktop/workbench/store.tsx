/**
 * Workbench 数据层：唯一的 Core 会话入口。
 * 规则：UI 不维护第二套业务状态机——渲染只消费 snapshot + 事件触发刷新。
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ClientSession } from '../../../packages/client-transport/p1/types.ts';
import type {
  AccountProfileVM,
  Capabilities,
  ConnectionState,
  ConversationItemVM,
  QuotaVM,
  CoreHelloVM,
  Method,
  MethodMap,
  SnapshotVM,
} from '../../../packages/client-contract/c1r1p1/generated.ts';

export interface WorkbenchStore {
  hello: CoreHelloVM;
  snapshot: SnapshotVM;
  /** 全量时间线（message.listTimeline），按 scope 过滤由页面完成。 */
  timeline: ConversationItemVM[];
  /** 账号 Profile（脱敏）与额度快照，随 refresh 更新。 */
  accounts: AccountProfileVM[];
  quotas: QuotaVM[];
  connectionState: ConnectionState;
  readOnly: boolean;
  /** 写操作禁用时给用户看的具体原因。 */
  readOnlyReason: string;
  capabilities: Capabilities;
  /** 冻结时刻：断线时展示"数据截至"。 */
  frozenAtMs: number;
  now: () => number;
  call<M extends Method>(method: M, params: MethodMap[M]['params']): Promise<MethodMap[M]['result']>;
  refresh: () => Promise<void>;
  acquireControl: () => Promise<void>;
  releaseControl: () => Promise<void>;
}

const Ctx = createContext<WorkbenchStore | null>(null);

/** 测试注入点：静态渲染（renderToStaticMarkup）不跑 effects，测试用它直接注入 store。 */
export function StoreInjector({ value, children }: { value: WorkbenchStore; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): WorkbenchStore {
  const s = useContext(Ctx);
  if (!s) throw new Error('store missing');
  return s;
}

export function StoreProvider({
  session,
  now,
  children,
}: {
  session: ClientSession;
  now?: () => number;
  children: ReactNode;
}) {
  const [hello, setHello] = useState<CoreHelloVM>(session.hello);
  const [snapshot, setSnapshot] = useState<SnapshotVM | null>(null);
  const [timeline, setTimeline] = useState<ConversationItemVM[]>([]);
  const [accounts, setAccounts] = useState<AccountProfileVM[]>([]);
  const [quotas, setQuotas] = useState<QuotaVM[]>([]);
  const [frozenAtMs, setFrozenAtMs] = useState<number>(() => (now ?? Date.now)());
  const clock = now ?? Date.now;
  const refreshing = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const snap = await session.request('system.snapshot', {});
      const tl = await session.request('message.listTimeline', { limit: 200 } as never);
      setSnapshot(snap);
      setTimeline((tl as { items: ConversationItemVM[] }).items);
      const accts = await session.request('account.listProfiles', {} as never).catch(() => null);
      const qts = await session.request('quota.listSnapshots', {} as never).catch(() => null);
      if (accts) setAccounts((accts as { items: AccountProfileVM[] }).items);
      if (qts) setQuotas((qts as { items: QuotaVM[] }).items);
      setHello((h) => ({ ...h, connectionState: session.connectionState() }));
      setFrozenAtMs(clock());
    } catch {
      // 断线：保留最后已知快照，仅更新连接状态（"最后已知状态"语义）。
      setHello((h) => ({ ...h, connectionState: session.connectionState() }));
    } finally {
      refreshing.current = false;
    }
  }, [session, clock]);

  useEffect(() => {
    void refresh();
    const unsubscribe = session.subscribe(() => void refresh());
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [refresh, session]);

  const call = useCallback(
    async <M extends Method>(method: M, params: MethodMap[M]['params']) => {
      const result = await session.request(method, params);
      await refresh();
      return result;
    },
    [session, refresh],
  );

  const value = useMemo<WorkbenchStore | null>(() => {
    if (!snapshot) return null;
    const state = hello.connectionState;
    return {
      hello,
      snapshot,
      timeline,
      accounts,
      quotas,
      connectionState: state,
      readOnly: state !== 'CONNECTED_CONTROLLER',
      readOnlyReason:
        state === 'DISCONNECTED'
          ? '连接已断开'
          : state === 'RECONNECTING' || state === 'DEGRADED'
            ? '重连中'
            : '观察者只读',
      capabilities: hello.capabilities,
      frozenAtMs,
      now: clock,
      call,
      refresh,
      acquireControl: async () => {
        await session.request('control.acquire', {});
        setHello((h) => ({ ...h, connectionState: session.connectionState() }));
      },
      releaseControl: async () => {
        await session.request('control.release', { lease_id: session.hello.lease?.leaseId ?? 'lease-preview' } as never);
        setHello((h) => ({ ...h, connectionState: session.connectionState() }));
      },
    };
  }, [hello, snapshot, timeline, accounts, quotas, frozenAtMs, call, refresh, session, clock]);

  if (!value) return <div className="boot">正在连接 Core…</div>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
