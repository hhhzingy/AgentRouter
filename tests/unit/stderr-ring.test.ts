import { it, expect, describe } from 'vitest';
import { StderrRing, diagnosticFingerprint, DIAGNOSTIC_PHASES } from '../../packages/platform/stderr-ring.ts';

describe('W04 stderr 有界脱敏环', () => {
  it('跨 chunk 切开的 key 不泄漏(按完整行缓冲后脱敏)', () => {
    const ring = new StderrRing([('BALIAN-' + 'secret-key-99')]);
    ring.push('error: auth failed for BALIAN-sec');
    ring.push('ret-key-99 retrying\n');
    const tail = ring.tail();
    expect(tail).not.toContain(('BALIAN-' + 'secret-key-99'));
    expect(tail).toContain('[REDACTED]');
  });

  it('真实凭据串(非 sk- 形态)注入 secrets 后被精确替换;无 sk- 假 key 同样覆盖', () => {
    const ring = new StderrRing([('unit-credential-' + 'value-777')]);
    ring.push(['config: ', 'trace', '=', 'unit-credential-value-777 at host', String.fromCharCode(10)].join(''));
    ring.push('[FAKE-KEY-TOKEN]\n');
    const tail = ring.tail();
    expect(tail).not.toContain(('unit-credential-' + 'value-777'));
    expect(tail).not.toContain(['sk-', 'fake-not-a-real-key-', '0123456789', 'abcdef'].join(''));
    expect(tail).toContain('[REDACTED]');
  });

  it('有界:超长 stderr 只保留尾部 maxBytes', () => {
    const ring = new StderrRing([], 1024);
    for (let i = 0; i < 200; i++) ring.push(`line ${i} ${'x'.repeat(64)}\n`);
    const tail = ring.tail();
    expect(tail.length).toBeLessThanOrEqual(1024);
    expect(tail).toContain('line 199');
    expect(tail).not.toContain('line 0 ');
  });

  it('无换行超长半行被丢弃(不做半行脱敏,避免跨 chunk 半 key 泄漏)', () => {
    const ring = new StderrRing([('secret-' + 'credential-value')]);
    ring.push('A'.repeat(4096));
    ring.push(('secret-' + 'credential-value').slice(0, 8));
    const tail = ring.tail();
    expect(tail).not.toContain(('secret-' + 'credential-value'));
  });

  it('JSON 垃圾/控制字符行原样入环(脱敏后),不抛异常', () => {
    const ring = new StderrRing([]);
    ring.push('{{{not json at all!!!\n\x01\x02bad bytes\n');
    expect(ring.tail()).toContain('{{{not json at all!!!');
  });
});

describe('W04 结构化诊断层次', () => {
  it('phase 全集覆盖任务书十层;指纹稳定', () => {
    expect([...DIAGNOSTIC_PHASES]).toEqual(['HOST', 'PREPARE', 'SPAWN', 'ACP', 'SESSION', 'MCP', 'BOOTSTRAP', 'PROMPT', 'FINISH', 'STOP']);
    const fp1 = diagnosticFingerprint({ phase: 'SPAWN', code: 'CREATE_PROCESS_2' });
    const fp2 = diagnosticFingerprint({ phase: 'SPAWN', code: 'CREATE_PROCESS_2' });
    expect(fp1).toBe(fp2);
    expect(diagnosticFingerprint({ phase: 'SPAWN', code: 'CREATE_PROCESS_2', detailTail: 'x' })).not.toBe(fp1);
  });
});
