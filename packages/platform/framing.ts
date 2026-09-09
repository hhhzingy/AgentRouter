import { RouteError } from '../protocol/index.ts';
export class JsonLfDecoder {
  private pending = Buffer.alloc(0);
  constructor(readonly limit = 262144) {}
  push(chunk: Buffer): Record<string, any>[] {
    this.pending = Buffer.concat([this.pending, chunk]);
    const frames: Record<string, any>[] = [];
    let end;
    while ((end = this.pending.indexOf(10)) >= 0) {
      if (end > this.limit) throw new RouteError('FRAME_LIMIT');
      const bytes = this.pending.subarray(0, end);
      this.pending = this.pending.subarray(end + 1);
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (!text.trim()) continue;
      const obj = JSON.parse(text);
      if (!obj || Array.isArray(obj) || typeof obj !== 'object')
        throw new RouteError('INVALID_FRAME');
      frames.push(obj);
    }
    if (this.pending.length > this.limit) throw new RouteError('FRAME_LIMIT');
    return frames;
  }
  end() {
    if (this.pending.length) throw new RouteError('TRUNCATED_FRAME');
  }
}
