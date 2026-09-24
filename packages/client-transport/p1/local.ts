import { connect } from 'node:net';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { StdioServerProxy } from './stdio.ts';
import { P1MemoryTransport } from './memory.ts';
import type { ClientSession, ClientTransport, ConnectOptions } from './types.ts';
export class LocalCoreTransport implements ClientTransport {
  private transport?: P1MemoryTransport;
  private proxy?: StdioServerProxy;
  async desktopContext() {
    if (!this.proxy) throw Error('CONNECTION_LOST');
    const reply = (await this.proxy.desktopContext()) as {
      result?: { dataId: string; clientId: string; serverInstanceId: string };
      error?: { code: string };
    };
    if (reply.error || !reply.result) throw Error(reply.error?.code ?? 'INVALID_CONTEXT');
    return reply.result;
  }
  async grantSelectedDirectory(path: string) {
    if (!this.proxy) throw Error('CONNECTION_LOST');
    const reply = (await this.proxy.grantSelectedDirectory(path)) as any;
    if (reply.error) throw Error(reply.error.code);
    return reply.result;
  }
  constructor(
    readonly data: string,
    private readonly endpointSnapshot?: { address: string; credential: string },
  ) {}
  async connect(options: ConnectOptions): Promise<ClientSession> {
    await this.close();
    const endpoint =
      this.endpointSnapshot ??
      JSON.parse(readFileSync(resolve(this.data, 'endpoint.json'), 'utf8'));
    if (
      typeof endpoint.address !== 'string' ||
      !endpoint.address.startsWith('\\\\.\\pipe\\AgentRouter-')
    )
      throw Error('INVALID_LOCAL_ENDPOINT');
    const socket = connect(endpoint.address);
    await new Promise<void>((resolve, reject) => {
      const onClose = () => {
        clearTimeout(timer);
        reject(Error('CORE_AUTH_CLOSED'));
      };
      socket.once('close', onClose);
      socket.once('end', onClose);
      const timer = setTimeout(() => {
        socket.destroy();
        reject(Error('CORE_CONNECT_TIMEOUT'));
      }, 5000);
      socket.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      socket.once('connect', () => {
        socket.write(JSON.stringify({ credential: endpoint.credential }) + '\n');
        let text = '';
        const onData = (b: Buffer) => {
          text += b.toString('utf8');
          const boundary = text.indexOf('\n');
          if (boundary >= 0) {
            clearTimeout(timer);
            socket.off('close', onClose);
            socket.off('end', onClose);
            socket.off('data', onData);
            socket.pause();
            if (text.slice(0, boundary).trim() !== '{"attached":true}') {
              socket.destroy();
              reject(Error('CORE_AUTH_FAILED'));
            } else {
              const remainder = text.slice(boundary + 1);
              if (remainder) socket.unshift(Buffer.from(remainder));
              resolve();
            }
          }
        };
        socket.on('data', onData);
      });
    });
    const proxy = new StdioServerProxy(socket, socket);
    this.proxy = proxy;
    this.transport = new P1MemoryTransport(proxy);
    socket.resume();
    const session = await this.transport.connect(options);
    return {
      ...session,
      connectionState: () => socket.destroyed ? 'DISCONNECTED' : session.connectionState(),
    };
  }
  async close() {
    await this.transport?.close();
    this.transport = undefined;
  }
}
