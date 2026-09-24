import type { CoreTransport, CoreSession, ConnectOptions, RequestOptions } from './index.ts';
import { MockCoreServer } from '../core-api/mock-server.ts';
import {
  ContractError,
  type Method,
  type MethodMap,
  type CoreHelloVM,
  type LeaseVM,
  type ConnectionState,
} from '../client-contract/index.ts';
/** 仅合同测试；principal 在受信任测试边界提供，不能用于真实 SSH 身份认证。 */
export class InMemoryTransport implements CoreTransport {
  private connection?: string;
  private session?: CoreSession;
  constructor(
    readonly server: MockCoreServer,
    readonly principal = 'mock_operator',
    readonly authorizedController = true,
  ) {}
  async connect(options: ConnectOptions): Promise<CoreSession> {
    if (this.connection) throw new ContractError('ALREADY_INITIALIZED', 'CONFLICT');
    const c = this.server.open(this.principal, this.authorizedController);
    this.connection = c;
    const invoke = async (method: Method, params: unknown, opts: RequestOptions = {}) => {
      if (this.connection !== c) throw new ContractError('CONNECTION_LOST', 'UNAVAILABLE');
      if (opts.signal?.aborted) throw new ContractError('REQUEST_CANCELLED', 'AMBIGUOUS');
      if (opts.timeoutMs !== undefined && (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs <= 0))
        throw new ContractError('REQUEST_TIMEOUT', 'AMBIGUOUS');
      const response = await this.server.handle(c, {
        v: 1,
        id: 'req_' + crypto.randomUUID(),
        method,
        params,
        ...(opts.operationId !== undefined
          ? {
              operation_id: opts.operationId,
              client_id: options.clientId,
              expected_revision: opts.expectedRevision,
              scope: opts.scope,
              ...(opts.leaseId ? { lease_id: opts.leaseId } : {}),
            }
          : {}),
      });
      if (response.error)
        throw new ContractError(
          response.error.code,
          response.error.category,
          response.error.details,
        );
      return response.result;
    };
    try {
      const hello = (await invoke('system.initialize', {
        client_protocol: 'agentrouter-client/1',
        client_version: options.clientVersion,
        client_id: options.clientId,
        requested_mode: options.requestedMode,
        ...(options.lastEventCursor !== undefined
          ? { last_event_cursor: options.lastEventCursor }
          : {}),
        ...(options.lastServerInstanceId
          ? { last_server_instance_id: options.lastServerInstanceId }
          : {}),
      })) as CoreHelloVM;
      let lease: LeaseVM | null = null;
      this.session = {
        hello,
        request: async <M extends Method>(m: M, p: MethodMap[M]['params'], o?: RequestOptions) => {
          const result = await invoke(m, p, o);
          if (m === 'control.acquire' || m === 'control.renew') lease = result as LeaseVM;
          if (m === 'control.release') lease = null;
          return result as MethodMap[M]['result'];
        },
        subscribe: (fn) => this.server.subscribe(c, fn),
        connectionState: (): ConnectionState =>
          this.connection !== c
            ? 'DISCONNECTED'
            : lease && lease.expiresAtMs > this.server.clock()
              ? 'CONNECTED_CONTROLLER'
              : 'CONNECTED_OBSERVER',
      };
      return this.session;
    } catch (e) {
      this.server.disconnect(c);
      this.connection = undefined;
      throw e;
    }
  }
  async close() {
    if (this.connection) this.server.disconnect(this.connection);
    this.connection = undefined;
  }
}
