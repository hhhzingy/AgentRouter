import type {Scope} from '../../../packages/client-contract/c1r1p1/generated.ts';
import {PendingStore,type PendingRecord} from './pending.ts';
import {failureState,errorMessage} from './action-state.ts';
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
import {
  methodMetadata,
  type LeaseVM,
} from '../../../packages/client-contract/c1r1p1/generated.ts';
import { scopeFor } from './requests.ts';
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
  /** Desktop 实际连接形态；用于显示 Local/Remote 身份，不参与权限判断。 */
  contextMode?: 'LOCAL_CORE' | 'REMOTE_CORE' | 'PREVIEW_MOCK';
  pendingOperations?:PendingRecord[];
  retryPending?:(id:string)=>Promise<void>;
  removePending?:(id:string)=>Promise<void>;
  pendingIdentity?:string;
  hello: CoreHelloVM;
  snapshot: SnapshotVM;
  /** 首批时间线（conversation.read）；角色详情按游标继续读取。 */
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
  call<M extends Method>(
    method: M,
    params: MethodMap[M]['params'],
    explicitScope?:Scope,
  ): Promise<MethodMap[M]['result']>;
  /** roleSession.* 连续性扩展：不经冻结 capability 清单；写操作仍需控制器租约与 Core 校验。 */
  callExtension: (method: string, params: Record<string, unknown>) => Promise<unknown>;
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
  const metadataLoaded = useRef(false);
  const refreshing = useRef(false),
    rerun = useRef(false);
  const lease = useRef<LeaseVM | null>(session.hello.lease);
  const [problem, setProblem] = useState<string | null>(null);
  const [pendingOperations,setPendingOperations]=useState<PendingRecord[]>([]);
  const [pendingIdentity,setPendingIdentity]=useState<string>();
  const [contextMode,setContextMode]=useState<'LOCAL_CORE'|'REMOTE_CORE'|'PREVIEW_MOCK'>('PREVIEW_MOCK');
  const pending=useRef<Promise<PendingStore>|undefined>(undefined);
  function getPending(){
    return pending.current??= (async()=>{
      const context=window.agentrouterDesktop ? await window.agentrouterDesktop.getContext() : {mode:'PREVIEW_MOCK' as const,dataId:session.hello.serverInstanceId,serverInstanceId:session.hello.serverInstanceId,clientId:'workbench'};
      if(context.serverInstanceId!==session.hello.serverInstanceId)throw Error('CORE_IDENTITY_MISMATCH');
      setContextMode(context.mode);
      const identity={mode:context.mode,dataId:context.dataId,clientId:context.clientId};
      const store=new PendingStore(localStorage,identity);store.migrateLegacy();setPendingIdentity(JSON.stringify(identity));setPendingOperations(store.list());return store;
    })();
  }
  useEffect(()=>{void getPending().catch(e=>setProblem(errorMessage(e)));},[session]);

  const supported = (m: Method) =>
    hello.capabilities.methods.includes(m) ||
    (hello.capabilities.mock && hello.capabilities.methods.length === 0);
  const refresh = useCallback(async () => {
    if (refreshing.current) {
      rerun.current = true;
      return;
    }
    refreshing.current = true;
    try {
      const snap = await session.request('system.snapshot', {});
      setSnapshot(snap);
      setFrozenAtMs(clock());
      setProblem(null);
      const caps = session.hello.capabilities;
      if (!metadataLoaded.current) {
        if (caps.methods.includes('account.listProfiles')) setAccounts((await session.request('account.listProfiles', {})).items);
        if (caps.methods.includes('quota.listSnapshots')) setQuotas((await session.request('quota.listSnapshots', {})).items);
        metadataLoaded.current=true;
      }
      setHello((h) => ({ ...h, connectionState: session.connectionState() }));
    } catch (e) {
      setProblem(errorMessage(e));
      setHello((h) => ({ ...h, connectionState: session.connectionState() }));
    } finally {
      refreshing.current = false;
      if (rerun.current) {
        rerun.current = false;
        queueMicrotask(() => void refresh());
      }
    }
  }, [session, clock]);
  const control = useCallback(
    async (method: 'control.acquire' | 'control.renew' | 'control.release') => {
      const snap = await session.request('system.snapshot', {});
      const result = await session.request(
        method,
        (method === 'control.acquire' ? {} : { lease_id: lease.current?.leaseId }) as never,
        { operationId: 'op_' + crypto.randomUUID(), expectedRevision: snap.revision, scope: {} },
      );
      lease.current = method === 'control.release' ? null : (result as LeaseVM);
      setHello((h) => ({ ...h, lease: lease.current, connectionState: session.connectionState() }));
    },
    [session],
  );
  useEffect(() => {
    void refresh();
    let scheduled:ReturnType<typeof setTimeout>|undefined;
    const off = session.subscribe(() => {
      if(!scheduled) scheduled=setTimeout(()=>{scheduled=undefined;void refresh();},250);
    });
    const connectionWatch=setInterval(()=>{const state=session.connectionState();setHello(h=>h.connectionState===state?h:{...h,connectionState:state});},1000);
    const verify = setInterval(()=>{metadataLoaded.current=false;void refresh();},30000);
    const timer = setInterval(() => {
      if (lease.current && lease.current.expiresAtMs - Date.now() < 15000)
        void control('control.renew').catch((e) => {lease.current=null;setProblem(errorMessage(e));});
    },5000);
    return () => {
      off();
      clearInterval(timer);clearInterval(verify);clearInterval(connectionWatch);clearTimeout(scheduled);
    };
  }, [refresh, session, control]);
  const call = useCallback(
    async <M extends Method>(
      method: M,
      params: MethodMap[M]['params'],
      explicitScope?:Scope,
    ): Promise<MethodMap[M]['result']> => {
      if (!supported(method)) throw Error('CAPABILITY_UNAVAILABLE');
      if (!methodMetadata[method].mutation) return session.request(method, params);
      if (!lease.current && session.connectionState() !== 'CONNECTED_CONTROLLER')
        throw Error('CONTROL_LEASE_REQUIRED');
      const snap = await session.request('system.snapshot', {});
      const records=await getPending();
      const command=records.prepare(method,params,snap.revision,explicitScope??scopeFor(method,params,snap));
      setPendingOperations(records.list());

      try {
        const result = await session.request(method, params, {
          operationId:command.operationId,expectedRevision:command.expectedRevision,scope:command.scope,
          leaseId: lease.current?.leaseId,
        });
        records.remove(command.recordId);setPendingOperations(records.list());
        await refresh();
        return result;
      } catch (e) {
        if(failureState(e)==='uncertain') records.markUncertain(command.recordId);
        else records.remove(command.recordId);
        setPendingOperations(records.list());setProblem(errorMessage(e));
        throw e;
      }
    },
    [session, refresh, hello.capabilities],
  );
  const callExtension = useCallback(
    async (method: string, params: Record<string, unknown>): Promise<unknown> => {
      if (!method.startsWith('roleSession.') && !method.startsWith('participant.slot.') && !method.startsWith('remoteDevice.') && !['result.evidence','result.reviewStatus','result.requestChanges'].includes(method))
        throw Error('UNSUPPORTED_METHOD');
      const mutation =
        method === 'roleSession.create' ||
        method === 'roleSession.switch' ||
        method === 'participant.slot.create' ||
        method === 'result.requestChanges' ||
        method === 'remoteDevice.createPairing' ||
        method === 'remoteDevice.revoke';
      if (mutation && !lease.current && session.connectionState() !== 'CONNECTED_CONTROLLER')
        throw Error('CONTROL_LEASE_REQUIRED');
      const request = session.request as (
        extensionMethod: string,
        extensionParams: unknown,
        options?: {
          leaseId?: string;
          requestKey?: string;
          operationId?: string;
          expectedRevision?: number;
          preflightHash?: string;
        },
      ) => Promise<any>;
      if (!mutation) {
        if (method === 'participant.slot.list')
          return request(method, params, { leaseId: lease.current?.leaseId });
        return request(method, params);
      }
      if (method.startsWith('remoteDevice.') || method === 'participant.slot.create') {
        const snapshot = (await request('system.snapshot', {})) as { revision: number };
        return request(method, params, {
          leaseId: lease.current?.leaseId,
          operationId: 'op_' + crypto.randomUUID(),
          expectedRevision: snapshot.revision,
        });
      }
      if (method === 'result.requestChanges') {
        const records=await getPending();
        if(records.list().some(r=>r.method===method&&r.state==='uncertain'&&(r.params as {id?:unknown})?.id===params.id))throw Error('CHECK_STATUS_REQUIRED');
        let command=records.list().find(r=>r.method===method&&JSON.stringify(r.params)===JSON.stringify(params));
        if(command?.state==='uncertain')throw Error('CHECK_STATUS_REQUIRED');
        if(!command){const snapshot=(await request('system.snapshot',{})) as {revision:number};command=records.prepare(method,params,Number(snapshot.revision),{});}
        setPendingOperations(records.list());
        try{const result=await request(method,command.params,{leaseId:lease.current?.leaseId,operationId:command.operationId,expectedRevision:command.expectedRevision});records.remove(command.recordId);setPendingOperations(records.list());await refresh();return result;}
        catch(e){if(failureState(e)==='uncertain')records.markUncertain(command.recordId);else records.remove(command.recordId);setPendingOperations(records.list());throw e;}
      }
      const records = await getPending();
      let command = records.list().find(r => r.method === method && JSON.stringify(r.params) === JSON.stringify(params));
      const retrying = Boolean(command);
      if (!command) {
      const snapshot = (await request('system.snapshot', {})) as { revision: number };
      const preflightParams = {
        role_id: params.role_id,
        ...(typeof params.session_id === 'string'
          ? { session_id: params.session_id }
          : typeof params.target_harness === 'string'
            ? { target_harness: params.target_harness }
            : {}),
      };
      const preflight = (await request('roleSession.preflight', preflightParams)) as {
        preflight_hash?: unknown;
      };
      if (typeof preflight.preflight_hash !== 'string') throw Error('PREFLIGHT_REQUIRED');
      command = records.prepare(method as 'roleSession.create' | 'roleSession.switch', params, Number(snapshot.revision), {}, preflight.preflight_hash);
      }
      if (!command.requestKey || !command.preflightHash) throw Error('PENDING_STORAGE_INVALID');
      setPendingOperations(records.list());
      try {
        const result = await request(method, command.params, {
          leaseId: lease.current?.leaseId,
          requestKey: command.requestKey,
          operationId: command.operationId,
          expectedRevision: command.expectedRevision,
          preflightHash: command.preflightHash,
        });
        records.remove(command.recordId);setPendingOperations(records.list());
        await refresh();
        return result;
      } catch (e) {
        if (retrying || failureState(e) === 'uncertain') records.markUncertain(command.recordId);
        else records.remove(command.recordId);
        setPendingOperations(records.list());setProblem(errorMessage(e));
        throw e;
      }
    },
    [session, refresh],
  );
  const value = useMemo<WorkbenchStore | null>(() => {
    if (!snapshot) return null;
    const state = hello.connectionState;
    return {
      pendingOperations,pendingIdentity,contextMode,
      retryPending:async(id)=>{const record=(await getPending()).list().find(r=>r.recordId===id);if(!record)throw Error('NOT_FOUND');if(record.method==='result.requestChanges')throw Error('CHECK_STATUS_REQUIRED');if(record.method==='roleSession.create'||record.method==='roleSession.switch')await callExtension(record.method,record.params as Record<string,unknown>);else await call(record.method,record.params as MethodMap[Method]['params'],record.scope);},
      removePending:async(id)=>{const records=await getPending();records.remove(id);setPendingOperations(records.list());},
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
      callExtension,
      refresh,
      acquireControl: async() => {try{await control('control.acquire');}catch(e){setProblem(errorMessage(e));throw e;}},
      releaseControl: () => control('control.release'),
    };
  }, [
    pendingOperations,pendingIdentity,contextMode,
    hello,
    snapshot,
    timeline,
    accounts,
    quotas,
    frozenAtMs,
    call,
    callExtension,
    pendingOperations,
    pendingIdentity,
    refresh,
    session,
    clock,
    control,
  ]);

  if (!value)
    return (
      <div className="boot" role={problem ? 'alert' : undefined}>
        {problem ? `无法读取 Core：${problem}` : '正在连接 Core…'}
      </div>
    );
  return (
    <Ctx.Provider value={value}>
      {problem && (
        <div role="alert" className="hint tone-warning">
          {problem}
        </div>
      )}
      {children}
    </Ctx.Provider>
  );
}
