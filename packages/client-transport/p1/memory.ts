import { randomUUID } from 'node:crypto';
import {
  C1R1Error,
  validateFrame,
  validateResponse,
  methodMetadata,
  type CoreHelloVM,
  type Method,
  type MethodMap,
  type LeaseVM,
  type Response,
  type Event,
} from '../../client-contract/c1r1p1/index.ts';
import type {
  ClientTransport,
  ClientServer,
  ClientSession,
  ConnectOptions,
  RequestOptions,
} from './types.ts';
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
    const revision = options.contractRevision ?? 'C1R1P1';
    let lease: LeaseVM | null = null;
    const request = async <M extends Method>(
      method: M,
      params: MethodMap[M]['params'],
      opts: RequestOptions = {},
    ): Promise<MethodMap[M]['result']> => {
      if (this.connection !== c || generation !== this.generation)
        throw new C1R1Error('CONNECTION_LOST');
      if (opts.signal?.aborted) throw new C1R1Error('REQUEST_CANCELLED', 'AMBIGUOUS');
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
        validateFrame(result, revision);
        const reply = result as Response;
        if ('error' in reply) throw Object.assign(new Error(reply.error.code), reply.error);
        validateResponse(method, reply.result, revision);
        if (method === 'control.acquire' || method === 'control.renew')
          lease = reply.result as LeaseVM;
        if (method === 'control.release') lease = null;
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
      if (hello.contractRevision !== revision) throw new C1R1Error('PROTOCOL_INCOMPATIBLE');
      return {
        hello,
        request,
        subscribe: (fn) => {
          const unsub = this.server.subscribe(c, (e: Event) => {
            if (generation !== this.generation) return;
            validateFrame(e, revision);
            fn(e);
          });
          this.subscriptions.add(unsub);
          return () => {
            unsub();
            this.subscriptions.delete(unsub);
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
