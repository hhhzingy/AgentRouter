import { expect, test } from 'vitest';
import {
  ApprovedProvider,
  type ProviderTransport,
} from '../../packages/security/approved-provider.ts';
const secret = 'synthetic-stream-secret';
const delta = (text: string) =>
  'data: ' + JSON.stringify({ choices: [{ index: 0, delta: { content: text } }] }) + '\n\n';
const input = { model: 'test', messages: [{ role: 'user', content: 'dummy' }], stream: true };
function provider(raw: string, limit = 4096) {
  const transport: ProviderTransport = async () => ({
    statusCode: 200,
    body: (async function* () {
      for (const byte of Buffer.from(raw)) yield Buffer.from([byte]);
    })(),
  });
  return new ApprovedProvider(
    {
      origin: 'https://example.invalid',
      path: '/chat/completions',
      models: ['test'],
      maxResponseBytes: limit,
    },
    async () => secret,
    transport,
  );
}
test('缓冲SSE保留真实事件，跨字节UTF8并要求DONE', async () => {
  const r = await provider(delta('中文') + 'data: [DONE]\n\n').bufferedStream(input);
  expect(r.ok).toBe(true);
  if (r.ok)
    expect(r.response.events).toEqual([{ choices: [{ index: 0, delta: { content: '中文' } }] }]);
});
test('SSE跨事件反射完整凭据时不返回任何部分', async () => {
  expect(
    await provider(
      delta('synthetic-') + delta('stream-secret') + 'data: [DONE]\n\n',
    ).bufferedStream(input),
  ).toEqual({ ok: false, code: 'SECRET_IN_RESPONSE' });
});
test('SSE跨事件工具参数反射也拒绝', async () => {
  const raw = ['synthetic-', 'stream-secret']
    .map(
      (argumentsText) =>
        'data: ' +
        JSON.stringify({
          choices: [
            {
              index: 0,
              delta: { tool_calls: [{ index: 0, function: { arguments: argumentsText } }] },
            },
          ],
        }) +
        '\n\n',
    )
    .join('');
  expect(await provider(raw + 'data: [DONE]\n\n').bufferedStream(input)).toEqual({
    ok: false,
    code: 'SECRET_IN_RESPONSE',
  });
});
test.each([
  delta('safe'),
  delta('safe') + 'data: invalid\n\n',
  delta('safe') + 'data: [DONE]\n\n' + delta('late'),
  delta('safe') + 'event: arbitrary\n\n',
  'data: [DONE]\n\n',
])('SSE缺终止或非法尾部失败关闭 %#', async (raw) => {
  expect(await provider(raw).bufferedStream(input)).toEqual({
    ok: false,
    code: 'RESPONSE_INVALID',
  });
});
test('SSE响应上限在解析前生效', async () => {
  expect(
    await provider(delta('x'.repeat(500)) + 'data: [DONE]\n\n', 100).bufferedStream(input),
  ).toEqual({ ok: false, code: 'RESPONSE_TOO_LARGE' });
});
test('既有非流式接口仍拒绝stream且独立方法要求stream:true', async () => {
  const p = provider(delta('safe') + 'data: [DONE]\n\n');
  expect(await p.complete(input)).toEqual({ ok: false, code: 'STREAM_UNSUPPORTED' });
  expect(await p.bufferedStream({ ...input, stream: false })).toEqual({
    ok: false,
    code: 'STREAM_UNSUPPORTED',
  });
});
test('未终止上游超时并撤销真实传输signal', async () => {
  let signal: AbortSignal | undefined;
  const transport: ProviderTransport = async (r) => {
    signal = r.signal;
    return {
      statusCode: 200,
      body: (async function* () {
        yield Buffer.from(delta('safe'));
        await new Promise(() => {});
      })(),
    };
  };
  const p = new ApprovedProvider(
    {
      origin: 'https://example.invalid',
      path: '/chat/completions',
      models: ['test'],
      timeoutMs: 20,
    },
    async () => secret,
    transport,
  );
  expect(await p.bufferedStream(input)).toEqual({ ok: false, code: 'TIMEOUT' });
  expect(signal?.aborted).toBe(true);
});

test('SSE工具调用数组位置变化按逻辑index检查反射', async () => {
  const frame = (tools: unknown[]) =>
    'data: ' + JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: tools } }] }) + '\n\n';
  const raw =
    frame([
      { index: 0, function: { arguments: 'safe' } },
      { index: 1, function: { arguments: 'synthetic-' } },
    ]) +
    frame([{ index: 1, function: { arguments: 'stream-secret' } }]) +
    'data: [DONE]\n\n';
  expect(await provider(raw).bufferedStream(input)).toEqual({
    ok: false,
    code: 'SECRET_IN_RESPONSE',
  });
});
test('SSE缺少逻辑index拒绝而不猜测位置', async () => {
  const raw =
    'data: ' +
    JSON.stringify({ choices: [{ delta: { content: 'safe' } }] }) +
    '\n\ndata: [DONE]\n\n';
  expect(await provider(raw).bufferedStream(input)).toEqual({
    ok: false,
    code: 'RESPONSE_INVALID',
  });
});

test('SSE同帧重复工具index失败关闭', async () => {
  const raw =
    'data: ' +
    JSON.stringify({
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              { index: 0, function: { arguments: 'synthetic-' } },
              { index: 0, function: { arguments: 'stream-secret' } },
            ],
          },
        },
      ],
    }) +
    '\n\ndata: [DONE]\n\n';
  expect(await provider(raw).bufferedStream(input)).toEqual({
    ok: false,
    code: 'RESPONSE_INVALID',
  });
});

test('SSE跨事件Base64凭据仍拒绝', async () => {
  const encoded = Buffer.from(secret).toString('base64');
  expect(
    await provider(
      delta(encoded.slice(0, 8)) + delta(encoded.slice(8)) + 'data: [DONE]\n\n',
    ).bufferedStream(input),
  ).toEqual({ ok: false, code: 'SECRET_IN_RESPONSE' });
});
test('SSE非法UTF8不能被替换字符掩盖', async () => {
  const transport: ProviderTransport = async () => ({
    statusCode: 200,
    body: (async function* () {
      yield Buffer.from(delta('safe') + 'data: [DONE]\n\n');
      yield Buffer.from([255]);
    })(),
  });
  const p = new ApprovedProvider(
    { origin: 'https://example.invalid', path: '/chat/completions', models: ['test'] },
    async () => secret,
    transport,
  );
  expect(await p.bufferedStream(input)).toEqual({ ok: false, code: 'RESPONSE_INVALID' });
});
