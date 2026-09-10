import { connect } from 'node:net';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { StdioServerProxy } from './stdio.ts';
import { P1MemoryTransport } from './memory.ts';
import type { ClientSession, ClientTransport, ConnectOptions } from './types.ts';
export class LocalCoreTransport implements ClientTransport {
  private transport?: P1MemoryTransport;
  constructor(readonly data: string) {}
  async connect(options: ConnectOptions): Promise<ClientSession> {
    await this.close();
    const endpoint = JSON.parse(readFileSync(resolve(this.data, 'endpoint.json'), 'utf8'));
    if (
      typeof endpoint.address !== 'string' ||
      !endpoint.address.startsWith('\\\\.\\pipe\\AgentRouter-')
    )
      throw Error('INVALID_LOCAL_ENDPOINT');
    const socket = connect(endpoint.address);
    await new Promise<void>((resolve, reject) => {
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
    this.transport = new P1MemoryTransport(proxy);
    socket.resume();
    return this.transport.connect(options);
  }
  async close() {
    await this.transport?.close();
    this.transport = undefined;
  }
}
