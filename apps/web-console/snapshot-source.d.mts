export interface ObserverTransport {
  connect(options: Record<string, unknown>): Promise<{ hello: { serverInstanceId: string }; request(method: string, params: object): Promise<any> }>;
  desktopContext(): Promise<{ dataId: string; clientId: string; serverInstanceId: string }>;
  close(): unknown;
}
export function createSnapshotSource(transport: ObserverTransport, now?: () => number): () => Promise<{
  updatedAt: number;
  connected: true;
  dataId: string;
  serverInstanceId: string;
  projects: Record<string, unknown>[];
  roles: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  runs: Record<string, unknown>[];
}>;
