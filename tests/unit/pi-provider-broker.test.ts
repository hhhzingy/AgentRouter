import { describe, expect, it } from 'vitest';
import { request as httpRequest } from 'node:http';
import {
  ApprovedProvider,
  deepSeekPolicy,
  type ProviderTransportRequest,
} from '../../packages/security/approved-provider.js';
import { createPiProviderBroker } from '../../packages/platform/pi-provider-broker.js';

const fakeSecret = 'fake-test-credential-only';
const events = 'data: {"choices":[{"index":0,"delta":{"content":"42"}}]}\n\ndata: [DONE]\n\n';
const requestBody = {
  model: 'deepseek-v4-flash',
  messages: [{ role: 'user', content: '17+25' }],
  stream: true,
};
const response = (body = events) => ({
  statusCode: 200,
  body: (async function* () {
    yield Buffer.from(body);
  })(),
});

describe('pi trusted provider broker', () => {
  it('preserves tool calls, bounds policy and releases only validated SSE', async () => {
    const calls: ProviderTransportRequest[] = [];
    const broker = await createPiProviderBroker(
      new ApprovedProvider(
        deepSeekPolicy,
        async () => fakeSecret,
        async (request) => {
          calls.push(request);
          return response();
        },
      ),
    );
    try {
      const tools = [
        { type: 'function', function: { name: 'route_context', parameters: { type: 'object' } } },
      ];
      const result = await fetch(`${broker.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${broker.capability}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          ...requestBody,
          tools,
          tool_choice: 'auto',
          max_tokens: 9000,
          thinking: { type: 'enabled' },
        }),
      });
      expect(result.status).toBe(200);
      expect(await result.text()).toBe(events);
      expect(calls).toHaveLength(1);
      expect(JSON.parse(calls[0]!.body)).toMatchObject({
        ...requestBody,
        tools,
        tool_choice: 'auto',
        thinking: { type: 'disabled' },
        max_tokens: 1024,
      });
      expect(calls[0]!.origin).toBe('https://api.deepseek.com');
      expect(calls[0]!.headers.authorization).toBe(`Bearer ${fakeSecret}`);
      expect(broker.capability).not.toContain(fakeSecret);
    } finally {
      await broker.close();
    }
  });
  it('rejects unauthenticated, browser, host, path, model and oversized requests before credentials', async () => {
    let credentials = 0;
    const broker = await createPiProviderBroker(
      new ApprovedProvider(
        deepSeekPolicy,
        async () => {
          credentials++;
          return fakeSecret;
        },
        async () => response(),
      ),
    );
    try {
      const headers = {
        authorization: `Bearer ${broker.capability}`,
        'content-type': 'application/json',
      };
      const hostStatus = await new Promise<number>((resolve, reject) => {
        const req = httpRequest(
          `${broker.baseUrl}/chat/completions`,
          { method: 'POST', headers: { ...headers, host: 'evil.invalid' } },
          (res) => {
            res.resume();
            resolve(res.statusCode!);
          },
        );
        req.on('error', reject);
        req.end(JSON.stringify(requestBody));
      });
      expect(hostStatus).toBe(403);
      for (const [path, overrides, body] of [
        ['/chat/completions', { authorization: 'Bearer wrong' }, requestBody],
        ['/chat/completions', { origin: 'http://evil.invalid' }, requestBody],
        ['/other', {}, requestBody],
        ['/chat/completions', {}, { ...requestBody, model: 'other' }],
        ['/chat/completions', {}, { ...requestBody, pad: 'x'.repeat(262145) }],
      ] as const) {
        const result = await fetch(`${broker.baseUrl}${path}`, {
          method: 'POST',
          headers: { ...headers, ...overrides },
          body: JSON.stringify(body),
        });
        expect(result.status).toBeGreaterThanOrEqual(400);
        await result.text();
      }
      expect(credentials).toBe(0);
    } finally {
      await broker.close();
    }
  });
  it('does not emit reflected secrets or retry failures', async () => {
    let calls = 0;
    const broker = await createPiProviderBroker(
      new ApprovedProvider(
        deepSeekPolicy,
        async () => fakeSecret,
        async () => {
          calls++;
          return response(events.replace('42', fakeSecret));
        },
      ),
    );
    try {
      const result = await fetch(`${broker.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${broker.capability}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      expect(result.status).toBe(502);
      const text = await result.text();
      expect(text).toContain('SECRET_IN_RESPONSE');
      expect(text).not.toContain(fakeSecret);
      expect(calls).toBe(1);
    } finally {
      await broker.close();
    }
  });
  it('close revokes ingress and waits for accepted upstream completion', async () => {
    let release!: () => void;
    let started!: () => void;
    const begun = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const broker = await createPiProviderBroker(
      new ApprovedProvider(
        deepSeekPolicy,
        async () => fakeSecret,
        async () => {
          started();
          await gate;
          return response();
        },
      ),
    );
    const client = fetch(`${broker.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${broker.capability}`, 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
    }).catch(() => undefined);
    await begun;
    let ended = false;
    const closing = broker.close().then(() => {
      ended = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(ended).toBe(false);
    release();
    await closing;
    await client;
    await expect(fetch(`${broker.baseUrl}/chat/completions`)).rejects.toThrow();
    await broker.close();
  });
});
