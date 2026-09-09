import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { validatePayload, validatePolicy } from '../../packages/protocol/index.ts';
describe('M01 规范和业务边界', () => {
  const root = 'docs/执行包/AgentRouter_V1.0功能与开发手册包/examples';
  for (const name of readdirSync(root))
    it(`T018/T026 ${name}`, () => {
      const data = JSON.parse(readFileSync(`${root}/${name}`, 'utf8'));
      if (name.startsWith('invalid_')) expect(() => validatePayload(data)).toThrow();
      else expect(() => validatePayload(data)).not.toThrow();
    });
  it('T018 中文字符未超字符上限但超过 UTF-8 字节上限时拒绝', () =>
    expect(() =>
      validatePayload({
        kind: 'notice',
        to: { type: 'user' },
        summary: '中文',
        body: '中'.repeat(24000),
        inputs: [],
      }),
    ).toThrow('BYTE_LIMIT'));
  it('T017 规则不允许脚本和远程引用', () => {
    for (const p of [
      { script: 'evil()' },
      { $ref: 'https://example.test/schema' },
      { fields: { x: { pattern: '.*' } } },
    ])
      expect(() => validatePolicy(p)).toThrow();
    expect(() =>
      validatePolicy({ fields: { review: { type: 'string', required: true, maxLength: 50 } } }),
    ).not.toThrow();
  });
});
