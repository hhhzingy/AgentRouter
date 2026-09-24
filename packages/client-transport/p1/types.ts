import type {
  CoreHelloVM,
  Method,
  MethodMap,
  Event,
  Scope,
  ConnectionState,
} from '../../client-contract/c1r1p1/generated.ts';
export type BackendMode = 'PREVIEW_MOCK' | 'LOCAL_CORE';
export type ConnectOptions = {
  clientId: string;
  clientVersion: string;
  requestedMode: 'controller' | 'observer';
  contractRevision?: 'C1R1P1' | 'C1R1';
  mode?: BackendMode;
};
export type RequestOptions = {
  operationId?: string;
  expectedRevision?: number;
  scope?: Scope;
  leaseId?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
};
export interface ClientSession {
  hello: CoreHelloVM;
  request<M extends Method>(
    method: M,
    params: MethodMap[M]['params'],
    options?: RequestOptions,
  ): Promise<MethodMap[M]['result']>;
  subscribe(fn: (event: Event) => void): () => void;
  connectionState(): ConnectionState;
}
export interface ClientTransport {
  connect(options: ConnectOptions): Promise<ClientSession>;
  close(): Promise<void>;
}
export interface ClientServer {
  open(
    principal?: string,
    mayAcquireController?: boolean,
    allowedProjects?: Set<string>,
    authenticated?: boolean,
    principalKind?: 'LOCAL_CLIENT' | 'REMOTE_DEVICE' | 'PARTICIPANT' | 'UNAUTHENTICATED',
  ): string;
  handle(connection: string, request: unknown): Promise<unknown>;
  subscribe(connection: string, handler: (event: Event) => void): () => void;
  disconnect(connection: string): void;
}
