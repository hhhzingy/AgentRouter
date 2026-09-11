import { randomUUID } from 'node:crypto';
import { JsonLfDecoder } from '../../platform/framing.ts';
import { NativeRpcError } from '../shared/rpc-peer.ts';
/** pi 0.85.1 JSONL dialect; no retry and no process-stop authority. */
export class PiRpcPeer {
  private decoder = new JsonLfDecoder();
  private closed = false;
  private tail = Promise.resolve();
  private pending = new Map<
    string,
    {
      command: string;
      resolve: (v: any) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(
    private options: {
      write: (b: Buffer) => Promise<void>;
      onEvent: (e: any) => void;
      onDisconnect: () => void;
      timeoutMs?: number;
    },
  ) {}
  request(command: string, args: Record<string, unknown> = {}): Promise<any> {
    if (this.closed) return Promise.reject(new NativeRpcError('RPC_CLOSED', 'none-proven'));
    if (this.pending.size >= 64)
      return Promise.reject(new NativeRpcError('RPC_PENDING_LIMIT', 'none-proven'));
    const id = randomUUID();
    let bytes: Buffer;
    try {
      if ('id' in args || 'type' in args) throw Error();
      bytes = Buffer.from(JSON.stringify({ ...args, id, type: command }) + '\n');
      if (bytes.length > 262144) throw Error();
    } catch {
      return Promise.reject(new NativeRpcError('RPC_REQUEST_INVALID', 'none-proven'));
    }
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => this.disconnect('RPC_TIMEOUT'),
        this.options.timeoutMs ?? 30000,
      );
      this.pending.set(id, { command, resolve, reject, timer });
    });
    this.tail = this.tail
      .then(async () => {
        if (!this.closed) await this.options.write(bytes);
      })
      .catch(() => this.disconnect('RPC_WRITE_FAILED'));
    return result;
  }
  accept(bytes: Buffer) {
    if (this.closed) return;
    try {
      for (const frame of this.decoder.push(bytes)) {
        if (this.closed) break;
        if (frame.type !== 'response') {
          if (typeof frame.type !== 'string' || 'jsonrpc' in frame) throw Error();
          this.options.onEvent(frame);
          continue;
        }
        if (typeof frame.id !== 'string' || typeof frame.success !== 'boolean') throw Error();
        const p = this.pending.get(frame.id);
        if (!p) continue; // old/duplicate reply cannot execute an operation
        if (frame.command !== p.command) throw Error();
        this.pending.delete(frame.id);
        clearTimeout(p.timer);
        if (frame.success) p.resolve(frame.data);
        else p.reject(new NativeRpcError('RPC_NATIVE_REJECTED', 'possible'));
      }
    } catch {
      this.disconnect('RPC_PROTOCOL_INVALID');
    }
  }
  end() {
    this.disconnect('RPC_EOF');
  }
  disconnect(code = 'RPC_DISCONNECTED') {
    if (this.closed) return;
    this.closed = true;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new NativeRpcError(code, 'possible'));
    }
    this.pending.clear();
    try {
      this.options.onDisconnect();
    } catch {
      /* observer failure cannot leave pending work alive */
    }
  }
}
