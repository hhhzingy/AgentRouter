import { randomBytes } from 'node:crypto';
import { createServer, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { Ajv2020 } from 'ajv/dist/2020.js';
// @ts-expect-error Shared JavaScript tool definitions are the existing protocol source.
import { toolDefinitions } from './tool-definitions.mjs';

export type NativeRoleTool =
  | 'route_context'
  | 'route_send'
  | 'route_finish'
  | 'route_wait'
  | 'route_artifact_write'
  | 'route_artifact_register'
  | 'route_artifact_read';
export type NativeRoleHandler = (
  tool: NativeRoleTool,
  operationId: string,
  input: Record<string, unknown>,
) => Promise<unknown>;

/** Transport only: authorization, epochs and durable idempotency belong to the bound handler. */
export async function createNativeRoleBridge() {
  const ajv = new Ajv2020({ strict: false });
  const validators = new Map<string, ReturnType<typeof ajv.compile>>(
    toolDefinitions.map((tool: { name: string; inputSchema: object }) => [
      tool.name,
      ajv.compile(tool.inputSchema),
    ]),
  );
  const handlers = new Map<string, NativeRoleHandler>();
  const sockets = new Set<Socket>();
  let closed = false;
  let authority = '';
  const reply = (res: ServerResponse, status: number, value: unknown) => {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      Connection: 'close',
    });
    res.end(JSON.stringify(value));
  };
  const server = createServer(async (req, res) => {
    if (
      closed ||
      req.method !== 'POST' ||
      req.url !== '/tools' ||
      req.headers.origin !== undefined ||
      req.headers.host !== authority
    ) {
      reply(res, 403, { error: 'BRIDGE_BOUNDARY' });
      return;
    }
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    if (!token || req.headers.authorization !== `Bearer ${token}` || !handlers.has(token)) {
      reply(res, 401, { error: 'BRIDGE_AUTH_REQUIRED' });
      return;
    }
    if (
      req.headers['content-type']?.split(';')[0].trim() !== 'application/json' ||
      req.headers['content-encoding']
    ) {
      reply(res, 415, { error: 'INVALID_CONTENT_TYPE' });
      return;
    }
    try {
      let length = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 262144) {
          reply(res, 413, { error: 'INPUT_TOO_LARGE' });
          return;
        }
        chunks.push(chunk);
      }
      let body;
      try {
        body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
      } catch {
        reply(res, 400, { error: 'INVALID_INPUT' });
        return;
      }
      const validate = validators.get(body?.tool);
      if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).some((key) => !['tool', 'operation_id', 'input'].includes(key)) ||
        typeof body.operation_id !== 'string' ||
        !/^[A-Za-z0-9_.:-]{1,200}$/.test(body.operation_id) ||
        !validate ||
        !validate(body.input)
      ) {
        reply(res, 400, { error: 'INVALID_INPUT' });
        return;
      }
      // Recheck after body consumption so revocation also covers pending uploads.
      const handler = closed ? undefined : handlers.get(token);
      if (!handler) {
        reply(res, 401, { error: 'BRIDGE_AUTH_REVOKED' });
        return;
      }
      try {
        const result = await handler(body.tool, body.operation_id, body.input);
        const serialized = JSON.stringify({ result: result ?? null });
        if (serialized.includes(token)) {
          reply(res, 500, { error: 'SECRET_REFLECTION_BLOCKED', unknownOutcome: true });
          return;
        }
        reply(res, 200, { result: result ?? null });
      } catch {
        // A handler may have committed before throwing; the transport never retries.
        reply(res, 500, { error: 'BRIDGE_HANDLER_FAILED', unknownOutcome: true });
      }
    } catch {
      reply(res, 400, { error: 'INPUT_STREAM_FAILED' });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('BRIDGE_START_FAILED');
  authority = `127.0.0.1:${address.port}`;
  return {
    endpoint: `http://${authority}/tools`,
    issue(handler: NativeRoleHandler): string {
      if (closed) throw Error('BRIDGE_CLOSED');
      const token = randomBytes(32).toString('hex');
      handlers.set(token, handler);
      return token;
    },
    revoke(token: string): void {
      handlers.delete(token);
    },
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      handlers.clear();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        for (const socket of sockets) socket.destroy();
      });
    },
  };
}
