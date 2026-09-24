import { describe, expect, it } from 'vitest';
import {
  ApprovedProvider,
  deepSeekPolicy,
  type ProviderTransport,
  type ProviderTransportRequest,
} from '../../packages/security/approved-provider.ts';
// Entire file uses synthetic credentials and injected in-memory transports. No real network/file access.
const fake = 'synthetic-credential-for-test-only';
const input = {
  model: 'deepseek-v4-flash',
  messages: [{ role: 'user', content: 'small dummy task' }],
  max_tokens: 8,
  thinking: { type: 'disabled' },
};
const output = {
  choices: [{ message: { role: 'assistant', content: 'dummy result' } }],
  usage: { total_tokens: 9 },
};
async function* bytes(value: unknown) {
  yield Buffer.from(JSON.stringify(value));
}
function harness(statusCode = 200, value: unknown = output) {
  const requests: ProviderTransportRequest[] = [];
  const transport: ProviderTransport = async (request) => {
    requests.push(request);
    return { statusCode, body: bytes(value) };
  };
  return { requests, provider: new ApprovedProvider(deepSeekPolicy, async () => fake, transport) };
}
describe('approved Provider authentication boundary (fake transport only)', () => {
  it('sends secret only in Authorization to frozen approved target with lowest-thinking request intact', async () => {
    const { provider, requests } = harness();
    expect(await provider.complete(input)).toEqual({ ok: true, response: output });
    expect(requests).toHaveLength(1);
    expect(requests[0].origin).toBe('https://api.deepseek.com');
    expect(requests[0].path).toBe('/chat/completions');
    expect(requests[0].headers.authorization).toBe(`Bearer ${fake}`);
    expect(requests[0].body).not.toContain(fake);
    expect(JSON.parse(requests[0].body)).toEqual(input);
    expect(requests[0].signal.aborted).toBe(true);
  });
  it('rejects client endpoint/path/header overrides, other model, and SSE without a call', async () => {
    const { provider, requests } = harness();
    for (const extra of [
      { url: 'https://unapproved.invalid' },
      { origin: 'https://unapproved.invalid' },
      { path: '/elsewhere' },
      { headers: {} },
      { model: 'other' },
    ])
      expect(await provider.complete({ ...input, ...extra })).toEqual({
        ok: false,
        code: 'POLICY_REJECTED',
      });
    expect(await provider.complete({ ...input, stream: true })).toEqual({
      ok: false,
      code: 'STREAM_UNSUPPORTED',
    });
    expect(requests).toHaveLength(0);
  });
  it('rejects unsafe trusted policy construction and copies mutable approved configuration', async () => {
    for (const origin of [
      'malformed:' + fake,
      'http://api.deepseek.com',
      'https://user:pass@api.deepseek.com',
      'https://api.deepseek.com/path',
      'https://api.deepseek.com?x=1',
    ])
      expect(() => new ApprovedProvider({ ...deepSeekPolicy, origin }, async () => fake)).toThrow(
        'INVALID_PROVIDER_POLICY',
      );
    for (const path of ['//other', '/chat?secret=x', '/../other', '/chat%2fother'])
      expect(() => new ApprovedProvider({ ...deepSeekPolicy, path }, async () => fake)).toThrow(
        'INVALID_PROVIDER_POLICY',
      );
    const policy = { ...deepSeekPolicy, models: ['deepseek-v4-flash'] };
    const provider = new ApprovedProvider(
      policy,
      async () => fake,
      async () => ({ statusCode: 200, body: bytes(output) }),
    );
    policy.models.push('later-model');
    policy.origin = 'https://unapproved.invalid';
    expect(await provider.complete({ ...input, model: 'later-model' })).toEqual({
      ok: false,
      code: 'POLICY_REJECTED',
    });
  });
  it('rejects credential material in prompt/tools before transport including encoded variants', async () => {
    const { provider, requests } = harness();
    for (const content of [fake, Buffer.from(fake).toString('base64'), encodeURIComponent(fake)])
      expect(await provider.complete({ ...input, messages: [{ role: 'user', content }] })).toEqual({
        ok: false,
        code: 'SECRET_IN_BODY',
      });
    expect(await provider.complete({ ...input, tools: [{ description: fake }] })).toEqual({
      ok: false,
      code: 'SECRET_IN_BODY',
    });
    expect(requests).toHaveLength(0);
  });
  it('never follows redirects or returns upstream errors and never retries', async () => {
    for (const code of [301, 302, 307, 308, 401, 429, 500]) {
      const { provider, requests } = harness(code, {
        error: fake,
        url: `https://example.invalid/${fake}`,
      });
      const result = await provider.complete(input);
      expect(result).toEqual({ ok: false, code: 'UPSTREAM_REJECTED' });
      expect(JSON.stringify(result)).not.toContain(fake);
      expect(requests).toHaveLength(1);
      expect(requests[0].signal.aborted).toBe(true);
    }
  });
  it('redacts arbitrary thrown transport and credential failures', async () => {
    let calls = 0;
    const bad: ProviderTransport = async () => {
      calls++;
      throw new Error(`Authorization Bearer ${fake}`);
    };
    expect(
      await new ApprovedProvider(deepSeekPolicy, async () => fake, bad).complete(input),
    ).toEqual({ ok: false, code: 'TRANSPORT_FAILED' });
    expect(calls).toBe(1);
    expect(
      await new ApprovedProvider(
        deepSeekPolicy,
        async () => {
          throw new Error(fake);
        },
        bad,
      ).complete(input),
    ).toEqual({ ok: false, code: 'CREDENTIAL_UNAVAILABLE' });
    expect(calls).toBe(1);
  });
  it('rejects response reflection including JSON unicode escapes across chunks', async () => {
    for (const content of [fake, Buffer.from(fake).toString('base64')]) {
      expect(
        await harness(200, { choices: [{ message: { content } }] }).provider.complete(input),
      ).toEqual({ ok: false, code: 'SECRET_IN_RESPONSE' });
    }
    const reflected = JSON.stringify({ choices: [{ message: { content: fake } }] }).replaceAll(
      's',
      '\\u0073',
    );
    const transport: ProviderTransport = async () => ({
      statusCode: 200,
      body: (async function* () {
        for (const c of reflected) yield Buffer.from(c);
      })(),
    });
    expect(
      await new ApprovedProvider(deepSeekPolicy, async () => fake, transport).complete(input),
    ).toEqual({ ok: false, code: 'SECRET_IN_RESPONSE' });
  });
  it('enforces byte bounds before credential loading and while reading response', async () => {
    let loaded = 0;
    const transport: ProviderTransport = async () => ({ statusCode: 200, body: bytes(output) });
    const small = new ApprovedProvider(
      { ...deepSeekPolicy, maxRequestBytes: 5 },
      async () => {
        loaded++;
        return fake;
      },
      transport,
    );
    expect(await small.complete(input)).toEqual({ ok: false, code: 'REQUEST_TOO_LARGE' });
    expect(loaded).toBe(0);
    expect(
      await new ApprovedProvider(
        { ...deepSeekPolicy, maxResponseBytes: 5 },
        async () => fake,
        transport,
      ).complete(input),
    ).toEqual({ ok: false, code: 'RESPONSE_TOO_LARGE' });
  });
  it('times out stalled credential, transport, and response without retry and aborts transport', async () => {
    let calls = 0;
    let signal: AbortSignal | undefined;
    const stalled: ProviderTransport = async (request) => {
      calls++;
      signal = request.signal;
      return new Promise(() => {});
    };
    const policy = { ...deepSeekPolicy, timeoutMs: 10 };
    expect(
      await new ApprovedProvider(policy, () => new Promise(() => {}), stalled).complete(input),
    ).toEqual({ ok: false, code: 'TIMEOUT' });
    expect(calls).toBe(0);
    expect(await new ApprovedProvider(policy, async () => fake, stalled).complete(input)).toEqual({
      ok: false,
      code: 'TIMEOUT',
    });
    expect(calls).toBe(1);
    expect(signal?.aborted).toBe(true);
    const stalledBody: ProviderTransport = async (request) => {
      signal = request.signal;
      return {
        statusCode: 200,
        body: (async function* () {
          await new Promise(() => {});
          yield Buffer.alloc(0);
        })(),
      };
    };
    expect(
      await new ApprovedProvider(policy, async () => fake, stalledBody).complete(input),
    ).toEqual({ ok: false, code: 'TIMEOUT' });
    expect(signal?.aborted).toBe(true);
  });
  it('rejects malformed and error-shaped successful responses without returning their contents', async () => {
    for (const value of [
      { error: fake },
      [],
      null,
      { choices: [], error: { detail: 'upstream detail' } },
    ])
      expect((await harness(200, value).provider.complete(input)).ok).toBe(false);
    const transport: ProviderTransport = async () => ({
      statusCode: 200,
      body: (async function* () {
        yield Buffer.from('not json');
      })(),
    });
    expect(
      await new ApprovedProvider(deepSeekPolicy, async () => fake, transport).complete(input),
    ).toEqual({ ok: false, code: 'RESPONSE_INVALID' });
  });
});

it('rejects quote/backslash credentials in decoded request values and property names', async () => {
  for (const secret of ['synthetic-quote-"-credential', 'synthetic-slash-\\-credential']) {
    let called = false;
    const transport: ProviderTransport = async () => {
      called = true;
      return { statusCode: 200, body: bytes(output) };
    };
    const provider = new ApprovedProvider(deepSeekPolicy, async () => secret, transport);
    const attacks = [
      { ...input, messages: [{ role: 'user', content: secret }] },
      { ...input, tools: [{ function: { description: secret } }] },
      { ...input, messages: [{ role: 'user', content: 'dummy', [secret]: 'dummy' }] },
      {
        ...input,
        tools: [{ function: { parameters: { properties: { [secret]: { type: 'string' } } } } }],
      },
    ];
    for (const request of attacks)
      expect(await provider.complete(request)).toEqual({ ok: false, code: 'SECRET_IN_BODY' });
    expect(called).toBe(false);
  }
});

it('rejects quote/backslash credentials reflected in decoded response values and property names', async () => {
  for (const secret of ['synthetic-quote-"-credential', 'synthetic-slash-\\-credential']) {
    for (const response of [
      { choices: [{ message: { content: secret } }] },
      { choices: [{ message: { content: 'dummy', [secret]: 'dummy' } }] },
      { choices: [], [secret]: 'dummy' },
    ]) {
      const transport: ProviderTransport = async () => ({ statusCode: 200, body: bytes(response) });
      expect(
        await new ApprovedProvider(deepSeekPolicy, async () => secret, transport).complete(input),
      ).toEqual({ ok: false, code: 'SECRET_IN_RESPONSE' });
    }
  }
});

it('rejects malformed UTF-8 even when replacement characters would form valid JSON', async () => {
  const transport: ProviderTransport = async () => ({
    statusCode: 200,
    body: (async function* () {
      yield Buffer.from('{"choices":[{"message":{"content":"');
      yield Uint8Array.from([0xc3, 0x28]);
      yield Buffer.from('"}}]}');
    })(),
  });
  expect(
    await new ApprovedProvider(deepSeekPolicy, async () => fake, transport).complete(input),
  ).toEqual({ ok: false, code: 'RESPONSE_INVALID' });
});
