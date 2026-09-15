import { expect, it } from 'vitest';
import { DeepSeekContextCompressionBackend, type CompressionAttempt, type DeepSeekCompressionConfig } from '../../packages/core-service/deepseek-context-compression.ts';
import type { ContextCompressionBackendInput } from '../../packages/core-service/context-migration.ts';
import type { ProviderTransport } from '../../packages/security/approved-provider.ts';

const config: DeepSeekCompressionConfig = { id: 'deepseek.test', model: 'deepseek-test',
  allowedResolvedModels: ['deepseek-test'], contextWindowTokens: 100000, maxOutputTokens: 3000,
  inputReserveTokens: 100, policy: { origin: 'https://api.deepseek.com', path: '/chat/completions', models: ['deepseek-test'] } };
const input: ContextCompressionBackendInput = { roleId: 'role', budgetTokens: 3000, inputBytes: 1, inputTokens: 1,
  entries: [{ roleId: 'role', contextSeq: 1, sourceWorkSessionId: 'ws', sourceKind: 'conversation', sourceId: 'message', portableKind: 'USER_MESSAGE',
    contentHash: 'a'.repeat(64), content: '接口必须保留 v2；禁止改写 legacy 目录。', metadata: {}, createdAtMs: 1 }] };
const summary = { narrative: '继续 v2 接口工作。', decisions: ['保留 v2'], constraints: ['禁止改写 legacy 目录'],
  failures: [], pending: [], conflicts: [], sources: [{ seq: 1, hash: 'a'.repeat(64) }] };
function fixture(change: (r: any) => void = () => {}, cfg = config) {
  const attempts: CompressionAttempt[] = [], requests: any[] = [];
  const transport: ProviderTransport = async r => {
    requests.push(JSON.parse(r.body));
    const response = { model: 'deepseek-test', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(summary) } }],
      usage: { prompt_tokens: 110, completion_tokens: 50 } };
    change(response);
    return { statusCode: 200, body: (async function* () { yield Buffer.from(JSON.stringify(response)); })() };
  };
  return { attempts, requests, backend: new DeepSeekContextCompressionBackend(cfg, async () => 'test-credential-private', a => attempts.push(a), transport) };
}
it('受信 Provider 收到 Portable 语义材料，保留引用并记录实际 usage 与 wire 量', async () => {
  const f = fixture();
  const result = await f.backend.compress(input);
  expect(result.summary).toEqual(summary);
  expect(f.requests[0].messages[1].content).toContain('禁止改写 legacy');
  expect(f.requests[0].messages[1].content).not.toContain('authoritative_state');
  expect(f.attempts[0]).toMatchObject({ status: 'SUCCEEDED', providerInputTokens: 110, providerOutputTokens: 50, tokenMethod: 'UTF8_BYTE_UPPER_BOUND' });
  expect(f.attempts[0].inputBytes).toBeGreaterThan(input.inputBytes);
  expect(JSON.stringify(f.attempts)).not.toContain('test-credential-private');
});
it.each(['length', 'tool_calls', 'content_filter'])('拒绝 %s 终止，不重试', async finish => {
  const f = fixture(r => { r.choices[0].finish_reason = finish; });
  await expect(f.backend.compress(input)).rejects.toThrow('COMPRESSION_OUTPUT_INCOMPLETE');
  expect(f.requests).toHaveLength(1);
  expect(f.attempts).toHaveLength(1);
});
it('拒绝来源遗漏，不信任模型自报覆盖', async () => {
  const f = fixture(r => { r.choices[0].message.content = JSON.stringify({ ...summary, sources: [] }); });
  await expect(f.backend.compress(input)).rejects.toThrow('COMPRESSION_SOURCE_COVERAGE_MISMATCH');
});
it('拒绝截断 JSON 和非预期 resolved model', async () => {
  await expect(fixture(r => { r.choices[0].message.content = '{'; }).backend.compress(input)).rejects.toThrow('COMPRESSION_OUTPUT_INVALID');
  await expect(fixture(r => { r.model = 'other-provider'; }).backend.compress(input)).rejects.toThrow('COMPRESSION_MODEL_MISMATCH');
});
it('输入超限在网络前拒绝，不接受调用方虚报 token/字节', async () => {
  const f = fixture(() => {}, { ...config, contextWindowTokens: 3200 });
  await expect(f.backend.compress(input)).rejects.toThrow('COMPRESSION_INPUT_OVER_BUDGET');
  expect(f.requests).toHaveLength(0);
});
it('输出超限拒绝，审计不包含模型正文', async () => {
  const f = fixture(r => { r.choices[0].message.content = JSON.stringify({ ...summary, narrative: 'too large'.repeat(1000) }); });
  await expect(f.backend.compress(input)).rejects.toThrow('COMPRESSION_OUTPUT_OVER_BUDGET');
  expect(JSON.stringify(f.attempts)).not.toContain('too large');
});
