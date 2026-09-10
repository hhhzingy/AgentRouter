import { JsonLfDecoder } from '../../platform/framing.ts';
import { C1R1Error, type Event } from '../../client-contract/c1r1p1/index.ts';
import { randomUUID } from 'node:crypto';
import type { Readable, Writable } from 'node:stream';
import type { ClientServer } from './types.ts';
/** 一条受信任 stdio 流一个会话；身份由启动器决定，不从 Renderer 接收 principal。 */
export class StdioServerProxy implements ClientServer {
  private id?: string;
  private pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (e: Error) => void }
  >();
  private handlers = new Set<(e: Event) => void>();
  private closed = false;
  constructor(
    readonly input: Readable,
    readonly output: Writable,
  ) {
    const decoder = new JsonLfDecoder();
    input.on('data', (b: Buffer) => {
      try {
        for (const frame of decoder.push(b)) {
          if (frame.event) {
            for (const fn of this.handlers) fn(frame as Event);
          } else {
            const p = this.pending.get(frame.id);
            if (p) {
              this.pending.delete(frame.id);
              p.resolve(frame);
            }
          }
        }
      } catch {
        this.fail();
      }
    });
    input.on('end', () => {
      try {
        decoder.end();
      } finally {
        this.fail();
      }
    });
    input.on('error', () => this.fail());
    output.on('error', () => this.fail());
  }
  private fail() {
    this.closed = true;
    for (const p of this.pending.values()) p.reject(new C1R1Error('CONNECTION_LOST'));
    this.pending.clear();
    this.handlers.clear();
  }
  open() {
    if (this.id || this.closed) throw new C1R1Error('CONNECTION_LOST');
    return (this.id = 'connection_' + randomUUID());
  }
  handle(id: string, request: unknown) {
    if (id !== this.id || this.closed) return Promise.reject(new C1R1Error('CONNECTION_LOST'));
    const frame = request as { id: string };
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(frame.id, { resolve, reject });
      this.output.write(JSON.stringify(request) + '\n');
    });
  }
  subscribe(id: string, handler: (e: Event) => void) {
    if (id !== this.id) throw new C1R1Error('CONNECTION_LOST');
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }
  disconnect(id: string) {
    if (id === this.id) {
      this.output.end();
      this.fail();
    }
  }
}
