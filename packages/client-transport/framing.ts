import { JsonLfDecoder } from '../platform/framing.ts';
import { validateFrame } from '../client-contract/index.ts';
export const CLIENT_FRAME_MAX_BYTES = 262144;
export function encodeFrame(value: unknown): Buffer {
  validateFrame(value);
  const bytes = Buffer.from(JSON.stringify(value) + '\n');
  if (bytes.length - 1 > CLIENT_FRAME_MAX_BYTES) throw Error('FRAME_TOO_LARGE');
  return bytes;
}
export function clientDecoder(onFrame: (frame: unknown) => void) {
  const decoder = new JsonLfDecoder(CLIENT_FRAME_MAX_BYTES);
  return {
    push(chunk: Buffer) {
      for (const value of decoder.push(chunk)) {
        validateFrame(value);
        onFrame(value);
      }
    },
    end() {
      decoder.end();
    },
  };
}
