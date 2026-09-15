export interface ObserverTransport {
  connect(options: Record<string, unknown>): Promise<{ request(method: string, params: object): Promise<any> }>;
  close(): unknown;
}
export function createSnapshotSource(transport: ObserverTransport, now?: () => number): () => Promise<{
  updatedAt: number;
  connected: true;
  projects: Record<string, unknown>[];
  roles: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  runs: Record<string, unknown>[];
}>;
