import { createHash, randomBytes } from 'node:crypto';
import { createServer, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import type { ApprovedProvider, ProviderResult } from '../security/approved-provider.js';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(
          (key) => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key]),
        )
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}

/** Trusted parent owns the provider; the child receives only a revocable loopback capability. */
export async function createPiProviderBroker(provider: ApprovedProvider, model = 'deepseek-v4-flash', maxTokensCap = 1024) {
  const capability = randomBytes(32).toString('hex');
  const sockets = new Set<Socket>();
  const pending = new Set<Promise<unknown>>();
  // No eviction: evicting an unknown outcome could permit a duplicate paid call.
  const requests = new Map<string, Promise<ProviderResult>>();
  const maxRequests = 32;
  let closed = false;
  let authority = '';
  let closing: Promise<void> | undefined;
  const reply = (res: ServerResponse, status: number, code: string) => {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      Connection: 'close',
    });
    res.end(JSON.stringify({ error: { code } }));
  };
  const server = createServer(async (req, res) => {
    if (
      closed ||
      req.method !== 'POST' ||
      req.url !== '/v1/chat/completions' ||
      req.headers.host !== authority ||
      req.headers.origin !== undefined
    ) {
      reply(res, 403, 'BROKER_BOUNDARY');
      return;
    }
    if (req.headers.authorization !== `Bearer ${capability}`) {
      reply(res, 401, 'BROKER_AUTH_REQUIRED');
      return;
    }
    if (
      req.headers['content-type']?.split(';')[0].trim() !== 'application/json' ||
      req.headers['content-encoding']
    ) {
      reply(res, 415, 'INVALID_CONTENT_TYPE');
      return;
    }
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 262144) {
          reply(res, 413, 'INPUT_TOO_LARGE');
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      const body: unknown = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
      );
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        reply(res, 400, 'INVALID_INPUT');
        return;
      }
      const input = body as Record<string, unknown>;
      if (
        input.model !== model ||
        input.stream !== true ||
        !Array.isArray(input.messages) ||
        input.messages.length === 0 ||
        (input.max_tokens !== undefined &&
          (!Number.isSafeInteger(input.max_tokens) || Number(input.max_tokens) <= 0))
      ) {
        reply(res, 400, 'INVALID_INPUT');
        return;
      }
      // Close/revocation during an upload must not initiate an upstream request.
      if (closed) {
        reply(res, 403, 'BROKER_BOUNDARY');
        return;
      }
      const request: Record<string, unknown> = {
        model,
        messages: input.messages,
        stream: true,
        thinking: { type: 'disabled' },
        max_tokens: Math.min(Number(input.max_tokens ?? 1024), maxTokensCap),
      };
      for (const key of ['tools', 'tool_choice', 'parallel_tool_calls', 'temperature']) {
        if (input[key] !== undefined) request[key] = input[key];
      }
      const key = createHash('sha256').update(canonical(request)).digest('hex');
      let task = requests.get(key);
      if (!task) {
        if (requests.size >= maxRequests) {
          reply(res, 429, 'BROKER_REQUEST_LIMIT');
          return;
        }
        // Cache before entering injected code; even thrown/unknown outcomes remain terminal here.
        task = Promise.resolve()
          .then(() => provider.bufferedStream(request))
          .catch(() => ({ ok: false as const, code: 'TRANSPORT_FAILED' as const }));
        requests.set(key, task);
        pending.add(task);
      }
      let result;
      try {
        result = await task;
      } finally {
        pending.delete(task);
      }
      if (!result.ok) {
        reply(res, 502, result.code);
        return;
      }
      if (closed || res.destroyed || res.writableEnded) return;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        Connection: 'close',
      });
      for (const event of result.response.events as Record<string, unknown>[])
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      res.end('data: [DONE]\n\n');
    } catch {
      reply(res, 400, 'INVALID_INPUT');
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('BROKER_LISTEN_FAILED');
  authority = `127.0.0.1:${address.port}`;
  return {
    baseUrl: `http://${authority}/v1`,
    capability,
    close(): Promise<void> {
      if (closing) return closing;
      closed = true;
      closing = (async () => {
        const stopped = new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
        for (const socket of sockets) socket.destroy();
        // Client cancellation does not certify upstream cancellation; wait for accepted calls without retry.
        await Promise.allSettled([...pending]);
        await stopped;
      })();
      return closing;
    },
  };
}
