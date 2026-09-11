import { request as httpsRequest } from 'node:https';

/** Trusted broker boundary only: never expose this object, credential source, or transport to model tools. */
export interface ApprovedProviderPolicy {
  readonly origin: string;
  readonly path: string;
  readonly models: readonly string[];
  readonly timeoutMs?: number;
  readonly maxRequestBytes?: number;
  readonly maxResponseBytes?: number;
}
export const deepSeekPolicy: ApprovedProviderPolicy = Object.freeze({
  origin: 'https://api.deepseek.com',
  path: '/chat/completions',
  models: Object.freeze(['deepseek-v4-flash']),
});
export interface ProviderTransportRequest {
  readonly origin: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly signal: AbortSignal;
}
export interface ProviderTransportResponse {
  readonly statusCode: number;
  readonly body: AsyncIterable<Uint8Array>;
}
/** Injected transport is part of the trusted computing base; it must honor AbortSignal and never retry. */
export type ProviderTransport = (
  request: ProviderTransportRequest,
) => Promise<ProviderTransportResponse>;
export type ProviderFailure =
  | 'POLICY_REJECTED'
  | 'STREAM_UNSUPPORTED'
  | 'REQUEST_TOO_LARGE'
  | 'SECRET_IN_BODY'
  | 'CREDENTIAL_UNAVAILABLE'
  | 'TIMEOUT'
  | 'UPSTREAM_REJECTED'
  | 'RESPONSE_TOO_LARGE'
  | 'RESPONSE_INVALID'
  | 'SECRET_IN_RESPONSE'
  | 'TRANSPORT_FAILED';
export type ProviderResult =
  { ok: true; response: Record<string, unknown> } | { ok: false; code: ProviderFailure };
class Rejected extends Error {
  constructor(readonly code: ProviderFailure) {
    super(code);
  }
}

/** Direct node:https: explicit TLS verification, no proxy environment, redirect handling, retries, or shared agent. */
export const directHttpsTransport: ProviderTransport = ({ origin, path, headers, body, signal }) =>
  new Promise((resolve, reject) => {
    const target = new URL(origin);
    const req = httpsRequest(
      {
        protocol: 'https:',
        hostname: target.hostname,
        port: target.port || 443,
        method: 'POST',
        path,
        headers,
        agent: false,
        rejectUnauthorized: true,
        signal,
      },
      (response) => resolve({ statusCode: response.statusCode ?? 0, body: response }),
    );
    req.once('error', reject);
    req.end(body);
  });

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function secretVariants(secret: string): string[] {
  return [secret, encodeURIComponent(secret), Buffer.from(secret).toString('base64')];
}
function containsSecret(text: string, secret: string): boolean {
  return secretVariants(secret).some((value) => text.includes(value));
}
function structuredSecret(value: unknown, secret: string): boolean {
  // Walk decoded string values AND keys; JSON escaping can otherwise hide quote/backslash credentials.
  const pending: unknown[] = [value];
  while (pending.length) {
    const next = pending.pop();
    if (typeof next === 'string') {
      if (containsSecret(next, secret)) return true;
    } else if (Array.isArray(next)) {
      for (const child of next) pending.push(child);
    } else if (record(next)) {
      for (const [key, child] of Object.entries(next)) {
        if (containsSecret(key, secret)) return true;
        pending.push(child);
      }
    }
  }
  return false;
}
/** Buffer the bounded SSE response until every event is validated; never release partial secret-bearing output. */
function decodeSse(raw: string, secret: string): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  const strings = new Map<string, string>();
  let done = false;
  for (const block of raw.replaceAll('\r\n', '\n').split('\n\n')) {
    if (!block.trim()) continue;
    if (done) throw new Rejected('RESPONSE_INVALID');
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue;
      if (!line.startsWith('data:')) throw new Rejected('RESPONSE_INVALID');
      data.push(line.slice(5).replace(/^ /, ''));
    }
    if (!data.length) continue;
    const text = data.join('\n');
    if (text === '[DONE]') {
      done = true;
      continue;
    }
    let event: unknown;
    try {
      event = JSON.parse(text);
    } catch {
      throw new Rejected('RESPONSE_INVALID');
    }
    if (!record(event) || !Array.isArray(event.choices) || event.error !== undefined)
      throw new Rejected('RESPONSE_INVALID');
    if (structuredSecret(event, secret)) throw new Rejected('SECRET_IN_RESPONSE');
    // A model may split a reflected credential across successive delta strings.
    const pending: [unknown, string[]][] = [[event, []]];
    while (pending.length) {
      const [value, path] = pending.pop()!;
      if (typeof value === 'string') {
        const key = JSON.stringify(path),
          joined = (strings.get(key) ?? '') + value;
        if (containsSecret(joined, secret)) throw new Rejected('SECRET_IN_RESPONSE');
        strings.set(key, joined);
      } else if (Array.isArray(value)) {
        const seen = new Set<number>();
        value.forEach((child, i) => {
          const indexed = ['choices', 'tool_calls'].includes(path.at(-1) ?? '');
          if (
            indexed &&
            (!record(child) || !Number.isSafeInteger(child.index) || Number(child.index) < 0)
          )
            throw new Rejected('RESPONSE_INVALID');
          if (indexed) {
            const id = Number((child as Record<string, unknown>).index);
            if (seen.has(id)) throw new Rejected('RESPONSE_INVALID');
            seen.add(id);
          }
          pending.push([
            child,
            [...path, indexed ? '#' + String((child as Record<string, unknown>).index) : String(i)],
          ]);
        });
      } else if (record(value)) {
        Object.entries(value).forEach(([key, child]) => pending.push([child, [...path, key]]));
      }
    }
    events.push(event);
  }
  if (!done || !events.length) throw new Rejected('RESPONSE_INVALID');
  return events;
}
function positive(value: number | undefined, fallback: number, max: number): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result <= 0 || result > max)
    throw new Error('INVALID_PROVIDER_POLICY');
  return result;
}

/** No endpoint is accepted from a client request. SSE is bounded and buffered for whole-response validation. */
export class ApprovedProvider {
  private readonly origin: string;
  private readonly path: string;
  private readonly models: ReadonlySet<string>;
  private readonly timeoutMs: number;
  private readonly requestLimit: number;
  private readonly responseLimit: number;
  constructor(
    policy: ApprovedProviderPolicy,
    private readonly credential: () => Promise<string>,
    private readonly transport: ProviderTransport = directHttpsTransport,
  ) {
    let url: URL;
    try {
      url = new URL(policy.origin);
    } catch {
      throw new Error('INVALID_PROVIDER_POLICY');
    }
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      url.origin !== policy.origin ||
      !/^\/[a-zA-Z0-9/_-]+$/.test(policy.path) ||
      policy.path.includes('//') ||
      policy.path.includes('..') ||
      policy.models.length === 0 ||
      policy.models.some((model) => !/^[a-zA-Z0-9._-]+$/.test(model))
    )
      throw new Error('INVALID_PROVIDER_POLICY');
    this.origin = url.origin;
    this.path = policy.path;
    this.models = new Set(policy.models);
    this.timeoutMs = positive(policy.timeoutMs, 30_000, 300_000);
    this.requestLimit = positive(policy.maxRequestBytes, 262_144, 4_194_304);
    this.responseLimit = positive(policy.maxResponseBytes, 1_048_576, 16_777_216);
  }
  complete(input: unknown): Promise<ProviderResult> {
    return this.execute(input, false);
  }
  /** Returns validated upstream events in response.events; not a live token-forwarding API. */
  bufferedStream(input: unknown): Promise<ProviderResult> {
    return this.execute(input, true);
  }
  private async execute(input: unknown, streaming: boolean): Promise<ProviderResult> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const task = async (): Promise<ProviderResult> => {
      try {
        if (!record(input)) throw new Rejected('POLICY_REJECTED');
        // Serialization makes a bounded immutable snapshot, and rejects getters/toJSON failures without printing them.
        const body = JSON.stringify(input);
        if (Buffer.byteLength(body) > this.requestLimit) throw new Rejected('REQUEST_TOO_LARGE');
        const request: unknown = JSON.parse(body);
        if (!record(request)) throw new Rejected('POLICY_REJECTED');
        const allowed = new Set([
          'model',
          'messages',
          'max_tokens',
          'thinking',
          'stream',
          'temperature',
          'tools',
          'tool_choice',
          'parallel_tool_calls',
        ]);
        if (
          Object.keys(request).some((key) => !allowed.has(key)) ||
          typeof request.model !== 'string' ||
          !this.models.has(request.model) ||
          !Array.isArray(request.messages) ||
          request.messages.length === 0
        )
          throw new Rejected('POLICY_REJECTED');
        if (
          streaming
            ? request.stream !== true
            : request.stream !== undefined && request.stream !== false
        )
          throw new Rejected('STREAM_UNSUPPORTED');
        if (
          request.max_tokens !== undefined &&
          (!Number.isSafeInteger(request.max_tokens) || Number(request.max_tokens) <= 0)
        )
          throw new Rejected('POLICY_REJECTED');
        let secret: string;
        try {
          secret = await this.credential();
        } catch {
          throw new Rejected('CREDENTIAL_UNAVAILABLE');
        }
        if (controller.signal.aborted) throw new Rejected('TIMEOUT');
        if (
          typeof secret !== 'string' ||
          secret.length < 8 ||
          secret.length > 8192 ||
          /[\x00-\x20\x7f]/.test(secret)
        )
          throw new Rejected('CREDENTIAL_UNAVAILABLE');
        if (containsSecret(body, secret) || structuredSecret(request, secret))
          throw new Rejected('SECRET_IN_BODY');
        const reply = await this.transport({
          origin: this.origin,
          path: this.path,
          headers: {
            authorization: `Bearer ${secret}`,
            'content-type': 'application/json',
            'content-length': String(Buffer.byteLength(body)),
          },
          body,
          signal: controller.signal,
        });
        if (controller.signal.aborted) throw new Rejected('TIMEOUT');
        if (reply.statusCode < 200 || reply.statusCode >= 300)
          throw new Rejected('UPSTREAM_REJECTED');
        let size = 0;
        const chunks: Buffer[] = [];
        for await (const chunk of reply.body) {
          if (controller.signal.aborted) throw new Rejected('TIMEOUT');
          size += chunk.byteLength;
          if (size > this.responseLimit) throw new Rejected('RESPONSE_TOO_LARGE');
          chunks.push(Buffer.from(chunk));
        }
        let raw: string;
        try {
          raw = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
        } catch {
          throw new Rejected('RESPONSE_INVALID');
        }
        if (containsSecret(raw, secret)) throw new Rejected('SECRET_IN_RESPONSE');
        if (streaming) return { ok: true, response: { events: decodeSse(raw, secret) } };
        let response: unknown;
        try {
          response = JSON.parse(raw);
        } catch {
          throw new Rejected('RESPONSE_INVALID');
        }
        if (!record(response) || !Array.isArray(response.choices) || response.error !== undefined)
          throw new Rejected('RESPONSE_INVALID');
        if (structuredSecret(response, secret)) throw new Rejected('SECRET_IN_RESPONSE');
        return { ok: true, response };
      } catch (error) {
        return { ok: false, code: error instanceof Rejected ? error.code : 'TRANSPORT_FAILED' };
      }
    };
    try {
      return await Promise.race([
        task(),
        new Promise<ProviderResult>((resolve) => {
          timer = setTimeout(() => {
            controller.abort();
            resolve({ ok: false, code: 'TIMEOUT' });
          }, this.timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      controller.abort(); // Dispose response/request even on redirect, overflow, malformed body, or success.
    }
  }
}
