import { it, expect } from 'vitest';
import { assertTransition, certifyCapabilities } from '../../packages/domain/index.ts';
import { JsonLfDecoder } from '../../packages/platform/framing.ts';
it('M01 非法任务转移拒绝', () => {
  expect(() => assertTransition('QUEUED', 'DELIVERED')).toThrow();
  expect(() => assertTransition('RESULT_STAGED', 'DELIVERED')).not.toThrow();
  expect(() => assertTransition('DELIVERED', 'ACTIVE')).toThrow();
});
it('T002 未知能力默认阻断', () => {
  expect(() =>
    certifyCapabilities({ sessionCreate: 'supported', toolBridge: 'unverified' }),
  ).toThrow('CAPABILITY_UNVERIFIED');
});
it('T075 每个 UTF-8 分割位置、Unicode 行分隔符与 CRLF', () => {
  const bytes = Buffer.from(JSON.stringify({ text: '中文\u2028世界\u2029' }) + '\r\n');
  for (let i = 1; i < bytes.length; i++) {
    const d = new JsonLfDecoder();
    expect([...d.push(bytes.subarray(0, i)), ...d.push(bytes.subarray(i))]).toEqual([
      { text: '中文\u2028世界\u2029' },
    ]);
    d.end();
  }
});
it('T075 拒绝截断、超长及非法 UTF-8', () => {
  const d = new JsonLfDecoder(3);
  expect(() => d.push(Buffer.from('1234'))).toThrow();
  const e = new JsonLfDecoder();
  e.push(Buffer.from('{'));
  expect(() => e.end()).toThrow();
  expect(() => new JsonLfDecoder().push(Buffer.from([0xff, 10]))).toThrow();
});
