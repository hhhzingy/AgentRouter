import type {
  Method,
  MethodMap,
  Event,
  ConnectionState,
  CoreHelloVM,
  Scope,
} from '../client-contract/generated.ts';
export interface ConnectOptions {
  clientId: string;
  clientVersion: string;
  requestedMode: 'controller' | 'observer';
  lastEventCursor?: number;
  lastServerInstanceId?: string;
}
export interface RequestOptions {
  operationId?: string;
  expectedRevision?: number;
  scope?: Scope;
  leaseId?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}
export interface CoreSession {
  readonly hello: CoreHelloVM;
  request<M extends Method>(
    method: M,
    params: MethodMap[M]['params'],
    options?: RequestOptions,
  ): Promise<MethodMap[M]['result']>;
  subscribe(handler: (event: Event) => void): () => void;
  connectionState(): ConnectionState;
}
export interface CoreTransport {
  connect(options: ConnectOptions): Promise<CoreSession>;
  close(): Promise<void>;
}
/** W12 接线使用，接口不启动 SSH，不读取私钥。 */
export interface SshEndpoint {
  kind: 'SSH';
  hostAlias: string;
}
export interface LocalEndpoint {
  kind: 'LOCAL';
}
