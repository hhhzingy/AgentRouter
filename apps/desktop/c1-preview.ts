import { ipcMain } from 'electron';
import { MockCoreServer } from '../../packages/core-api/mock-server.ts';
import { InMemoryTransport } from '../../packages/client-transport/in-memory.ts';
import type { CoreSession } from '../../packages/client-transport/index.ts';
import { ContractError } from '../../packages/client-contract/index.ts';
/** 显式预览开关，C1 不把 Mock 接为生产 Core。每个 Renderer 独立连接。 */
export function installC1Preview(enabled: boolean) {
  const server = new MockCoreServer();
  const clients = new Map<number, { transport: InMemoryTransport; session: CoreSession }>();
  ipcMain.handle('c1:connect', async (event, options) => {
    if (!enabled) throw new ContractError('CAPABILITY_UNAVAILABLE', 'UNAVAILABLE');
    if (event.senderFrame !== event.sender.mainFrame)
      throw new ContractError('SCOPE_DENIED', 'AUTHORIZATION');
    if (clients.has(event.sender.id)) throw new ContractError('ALREADY_INITIALIZED', 'CONFLICT');
    const transport = new InMemoryTransport(server);
    const session = await transport.connect(options);
    clients.set(event.sender.id, { transport, session });
    session.subscribe((e) => {
      if (!event.sender.isDestroyed()) event.sender.send('c1:event', e);
    });
    event.sender.once('destroyed', () => {
      void transport.close();
      clients.delete(event.sender.id);
    });
    return session.hello;
  });
  ipcMain.handle('c1:request', async (event, method, params, options) => {
    const client = clients.get(event.sender.id);
    if (event.senderFrame !== event.sender.mainFrame || !client)
      throw new ContractError('NOT_INITIALIZED', 'AUTHORIZATION');
    try {
      return { result: await client.session.request(method, params, options) };
    } catch (error) {
      return {
        error: (error instanceof ContractError
          ? error
          : new ContractError('INTERNAL_ERROR', 'INTERNAL')
        ).wire('trace_desktop'),
      };
    }
  });
  ipcMain.handle('c1:close', async (event) => {
    await clients.get(event.sender.id)?.transport.close();
    clients.delete(event.sender.id);
  });
}
