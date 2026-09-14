import { randomUUID } from 'node:crypto';
import {
  C1R1Error,
  methodMetadata,
  type CoreHelloVM,
  type Method,
  type MethodMap,
  type LeaseVM,
  type Response,
  type Event,
} from '../../client-contract/c1r1p1/index.ts';
import {
  validateFrameForRevision,
  validateResponseForRevision,
} from '../../client-contract/c1r1p2.ts';
import type {
  ClientTransport,
  ClientServer,
  ClientSession,
  ConnectOptions,
  RequestOptions,
} from './types.ts';
import {
  isExtensionMethod,
  validateExternalApiFrame,
  validateExtensionResult,
} from '../../client-contract/external-api-1.ts';
export class P1MemoryTransport implements ClientTransport {
  private connection?: string;
  private generation = 0;
  private subscriptions = new Set<() => void>();
  constructor(
    readonly server: ClientServer,
    readonly principal = 'mock_human',
    readonly authorized = true,
  ) {}
  async connect(options: ConnectOptions): Promise<ClientSession> {
    if (this.connection) await this.close();
    const generation = ++this.generation,
      c = this.server.open(this.principal, this.authorized);
    this.connection = c;
    let revision = options.contractRevision ?? 'C1R1P1';
    let lease: LeaseVM | null = null;
    let observedCursor = 0,
      overflow = false;
    const buffered = new Map<number, Event>();
    const listeners = new Map<(e: Event) => void, number>();
    const sourceUnsub = this.server.subscribe(c, (e: Event) => {
      if (generation !== this.generation) return;
      validateFrameForRevision(e, revision);
      if (e.cursor <= observedCursor) return;
      buffered.set(e.cursor, e);
      if (buffered.size > 1000) {
        overflow = true;
        buffered.delete(buffered.keys().next().value!);
      }
      for (const [fn, last] of listeners)
        if (e.cursor > last) {
          listeners.set(fn, e.cursor);
          fn(e);
        }
    });
    this.subscriptions.add(sourceUnsub);
    const request = async <M extends Method>(
      method: M,
      params: MethodMap[M]['params'],
      opts: RequestOptions = {},
    ): Promise<MethodMap[M]['result']> => {
      if (this.connection !== c || generation !== this.generation)
        throw new C1R1Error('CONNECTION_LOST');
      if (opts.signal?.aborted) throw new C1R1Error('REQUEST_CANCELLED', 'AMBIGUOUS');
      if (isExtensionMethod(method as string)) {
        const extensionFrame = validateExternalApiFrame({
          v: 1,
          id: 'req_' + randomUUID(),
          method,
          ...(params ? { params } : {}),
          client_id: options.clientId,
          ...(opts.leaseId ? { lease_id: opts.leaseId } : {}),
          ...(opts.requestKey ? { request_key: opts.requestKey } : {}),
          ...(opts.operationId ? { operation_id: opts.operationId } : {}),
          ...(opts.expectedRevision !== undefined ? { expected_revision: opts.expectedRevision } : {}),
          ...(opts.preflightHash ? { preflight_hash: opts.preflightHash } : {}),
        });
        let extensionTimer: ReturnType<typeof setTimeout> | undefined;
        try {
          const reply = (await Promise.race([
            this.server.handle(c, extensionFrame),
            new Promise<never>((_, reject) => {
              extensionTimer = setTimeout(
                () => reject(new C1R1Error('REQUEST_TIMEOUT', 'AMBIGUOUS')),
                opts.timeoutMs ?? 10000,
              );
            }),
          ])) as Response;
          if ('id' in reply && reply.id !== extensionFrame.id) throw new C1R1Error('INVALID_FRAME');
          if ('error' in reply) throw Object.assign(new Error(reply.error.code), reply.error);
          validateExtensionResult(method as string, reply.result);
          if ((method as string) === 'contract.upgrade') revision = 'C1R1P2' as typeof revision;
          return reply.result as MethodMap[M]['result'];
        } finally {
          clearTimeout(extensionTimer);
        }
      }
      console.log('P2TRACE method:', method, 'revision:', revision);
      if ((revision as string) === 'C1R1P2' && String(method).startsWith('rolePlan.')) {
        // C1R1P2:rolePlan 帧含动态 HarnessId,冻结枚举不适用;服务端注册表为权威。
        const isMutation = methodMetadata[method].mutation;
        const p2frame = {
          v: 1 as const,
          id: 'req_' + randomUUID(),
          method,
          params,
          ...(isMutation
            ? {
                client_id: options.clientId,
                operation_id: opts.operationId,
                expected_revision: opts.expectedRevision,
                scope: opts.scope,
                ...(opts.leaseId ? { lease_id: opts.leaseId } : {}),
              }
            : {}),
        };
        let p2timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const reply = (await Promise.race([
            this.server.handle(c, p2frame),
            new Promise<never>((_, reject) => {
              p2timer = setTimeout(
                () => reject(new C1R1Error('REQUEST_TIMEOUT', 'AMBIGUOUS')),
                opts.timeoutMs ?? 10000,
              );
            }),
          ])) as Response;
          if ('id' in reply && reply.id !== p2frame.id) throw new C1R1Error('INVALID_FRAME');
          if ('error' in reply) throw Object.assign(new Error(reply.error.code), reply.error);
          return reply.result as MethodMap[M]['result'];
        } finally {
          clearTimeout(p2timer);
        }
      }
      const frame = {
        v: 1,
        id: 'req_' + randomUUID(),
        method,
        params,
        ...(methodMetadata[method].mutation
          ? {
              client_id: options.clientId,
              operation_id: opts.operationId,
              expected_revision: opts.expectedRevision,
              scope: opts.scope,
              ...(opts.leaseId ? { lease_id: opts.leaseId } : {}),
            }
          : {}),
      };
      validateFrameForRevision(frame, revision);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          this.server.handle(c, frame),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new C1R1Error('REQUEST_TIMEOUT', 'AMBIGUOUS')),
              opts.timeoutMs ?? 10000,
            );
          }),
        ]);
        validateFrameForRevision(result, revision);
        const reply = result as Response;
        if ('error' in reply) throw Object.assign(new Error(reply.error.code), reply.error);
        validateResponseForRevision(method, reply.result, revision);
        if (method === 'control.acquire' || method === 'control.renew')
          lease = reply.result as LeaseVM;
        if (method === 'control.release') lease = null;
        if (method === 'system.snapshot') {
          observedCursor = (reply.result as { cursor: number }).cursor;
          for (const key of buffered.keys()) if (key <= observedCursor) buffered.delete(key);
          overflow = false;
        }
        return reply.result as MethodMap[M]['result'];
      } finally {
        clearTimeout(timer);
      }
    };
    try {
      const hello = (await request('system.initialize', {
        client_protocol: 'agentrouter-client/1',
        client_version: options.clientVersion,
        client_id: options.clientId,
        requested_mode: options.requestedMode,
        contract_revision: revision,
      })) as CoreHelloVM;
      observedCursor = Math.max(observedCursor, hello.eventCursor);
      if (hello.contractRevision !== revision) throw new C1R1Error('PROTOCOL_INCOMPATIBLE');
      return {
        hello,
        request,
        subscribe: (fn) => {
          if (overflow) throw new C1R1Error('CURSOR_EXPIRED');
          listeners.set(fn, observedCursor);
          for (const e of buffered.values())
            if (e.cursor > (listeners.get(fn) ?? 0)) {
              listeners.set(fn, e.cursor);
              fn(e);
            }
          return () => {
            listeners.delete(fn);
          };
        },
        connectionState: () =>
          this.connection !== c
            ? 'DISCONNECTED'
            : lease && lease.expiresAtMs > Date.now()
              ? 'CONNECTED_CONTROLLER'
              : 'CONNECTED_OBSERVER',
      };
    } catch (e) {
      await this.close();
      throw e;
    }
  }
  async close() {
    ++this.generation;
    for (const unsub of this.subscriptions) unsub();
    this.subscriptions.clear();
    if (this.connection) this.server.disconnect(this.connection);
    this.connection = undefined;
  }
}
