import { expect, it } from 'vitest';
import { DeepSeekContextCompressionBackend } from '../../packages/core-service/deepseek-context-compression.ts';

function fixture(maxSegments = 8, failAt = -1) {
  const requests: any[] = [], attempts: any[] = [];
  const config = { id: 'deepseek.segmented', model: 'deepseek-test', allowedResolvedModels: ['deepseek-test'],
    contextWindowTokens: 100000, maxOutputTokens: 1000, inputReserveTokens: 100,
    policy: { origin: 'https://api.deepseek.com', path: '/chat/completions', models: ['deepseek-test'], maxRequestBytes: 9000 },
    segmentation: { maxSegments, maxTotalInputBytes: 100000 } };
  const backend = new DeepSeekContextCompressionBackend(config, async () => 'test-private-credential', a => attempts.push(a), async r => {
    expect(Buffer.byteLength(r.body)).toBeLessThanOrEqual(9000);
    const request = JSON.parse(r.body); requests.push(request);
    const material = JSON.parse(request.messages[1].content);
    const content = { narrative: '保留本段事实', decisions: [], constraints: [], failures: [], pending: [], conflicts: [], sources: material.sources };
    return { statusCode: 200, body: (async function* () { yield Buffer.from(JSON.stringify({ model: 'deepseek-test', choices: [
      { finish_reason: requests.length === failAt ? 'length' : 'stop', message: { content: JSON.stringify(content) } },
    ] })); })() };
  });
  const entries = Array.from({ length: 4 }, (_, i) => ({ roleId: 'role', contextSeq: i + 1, sourceWorkSessionId: null,
    sourceKind: 'synthetic', sourceId: 'source-' + i, portableKind: 'USER_MESSAGE' as const, contentHash: String(i + 1).repeat(64),
    content: 'fact-' + i + 'x'.repeat(5500), metadata: {}, createdAtMs: i }));
  return { backend, requests, attempts, input: { roleId: 'role', entries, budgetTokens: 6000, inputTokens: 0, inputBytes: 0 } };
}
it('超过单请求上限时分段，每个 source 恰好发送一次，不截取尾部', async () => {
  const f = fixture();
  const result = await f.backend.compress(f.input);
  expect(f.requests).toHaveLength(4);
  expect(f.requests.flatMap(r => JSON.parse(r.messages[1].content).sources.map((s: any) => s.seq))).toEqual([1, 2, 3, 4]);
  expect(result).toMatchObject({ coveredFromSeq: 1, coveredThroughSeq: 4, fidelity: 'COMPRESSED' });
  expect((result.summary as any).segments).toHaveLength(4);
  expect(Buffer.byteLength(JSON.stringify(result.summary))).toBeLessThanOrEqual(6000);
  expect(f.attempts.map(a => a.segmentIndex)).toEqual([0, 1, 2, 3]);
});
it('分段数超过授权上限时在首次网络前阻止', async () => {
  const f = fixture(2);
  await expect(f.backend.compress(f.input)).rejects.toThrow('COMPRESSION_SEGMENT_LIMIT');
  expect(f.requests).toHaveLength(0);
});
it('中途段被截断就停止，不继续发送、不自动重试、不返回部分成功', async () => {
  const f = fixture(8, 2);
  await expect(f.backend.compress(f.input)).rejects.toThrow('COMPRESSION_OUTPUT_INCOMPLETE');
  expect(f.requests).toHaveLength(2);
  expect(f.attempts.map(a => a.status)).toEqual(['SUCCEEDED', 'FAILED']);
});
it('4.8MB 多小条目压力：全量经过有界请求，不能把字节量宣称为实测 tokens', async () => {
  const sentSeqs: number[] = [], sizes: number[] = [];
  const backend = new DeepSeekContextCompressionBackend({ id: 'deepseek.large-offline', model: 'deepseek-test', allowedResolvedModels: ['deepseek-test'],
    contextWindowTokens: 1000000, maxOutputTokens: 2048, inputReserveTokens: 4096,
    policy: { origin: 'https://api.deepseek.com', path: '/chat/completions', models: ['deepseek-test'], maxRequestBytes: 262144 },
    segmentation: { maxSegments: 64, maxTotalInputBytes: 8 * 1024 * 1024 } }, async () => 'test-private-credential', () => {}, async r => {
    sizes.push(Buffer.byteLength(r.body));
    const material = JSON.parse(JSON.parse(r.body).messages[1].content);
    sentSeqs.push(...material.sources.map((s: any) => s.seq));
    const summary = { narrative: '本段全部来源', decisions: [], constraints: [], failures: [], pending: [], conflicts: [], sources: material.sources };
    return { statusCode: 200, body: (async function* () { yield Buffer.from(JSON.stringify({ model: 'deepseek-test', choices: [
      { finish_reason: 'stop', message: { content: JSON.stringify(summary) } },
    ] })); })() };
  });
  const entries = Array.from({ length: 240 }, (_, i) => ({ roleId: 'role', contextSeq: i + 1, sourceWorkSessionId: null,
    sourceKind: 'pressure', sourceId: 'source-' + i, portableKind: 'USER_MESSAGE' as const, contentHash: (i + 1).toString(16).padStart(64, '0'),
    content: ('row-' + i + ':').padEnd(20000, String(i % 10)), metadata: {}, createdAtMs: i }));
  const result = await backend.compress({ roleId: 'role', entries, budgetTokens: 256000, inputTokens: 0, inputBytes: 0 });
  expect(sentSeqs).toEqual(entries.map(e => e.contextSeq));
  expect(sizes.length).toBeGreaterThan(10);
  expect(Math.max(...sizes)).toBeLessThanOrEqual(262144);
  expect(Buffer.byteLength(JSON.stringify(result.summary))).toBeLessThanOrEqual(256000);
  expect(result.coveredThroughSeq).toBe(240);
});
