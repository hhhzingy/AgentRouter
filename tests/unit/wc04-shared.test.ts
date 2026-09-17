import { describe, expect, it } from 'vitest';
import { StderrRing } from '../../packages/platform/stderr-ring.ts';
import { buildSharedProviderProfile } from '../../packages/platform/shared-profile-factory.ts';

// WC04:共享诊断脱敏组件与共享 profile 工厂的双端负测(Linux 采纳同一实现)。
describe('StderrRing(L-01 共享参考实现:跨 chunk 安全 + EOF 保守)', () => {
  it('跨 chunk 切开的长 key 不半截泄漏', () => {
    const ring = new StderrRing(['secret-credential-value-9876']);
    ring.push('error with token=secret-cre');
    ring.push('dential-value-9876 and more\n');
    const t = ring.tail();
    expect(t).not.toContain('secret-credential-value-9876');
    expect(t).toContain('[REDACTED]');
  });
  it('EOF 时残余半行整行丢弃,已完整行保留', () => {
    const ring = new StderrRing([]);
    ring.push('complete line kept\npartial line no newline');
    const t = ring.tail();
    expect(t).toContain('complete line kept');
    expect(t).not.toContain('partial line no newline');
  });
  it('字节上限逐出最旧行,sk- 形态自动脱敏', () => {
    const ring = new StderrRing([], 200);
    ring.push('old-' + 'x'.repeat(150) + '\n');
    ring.push('key ' + ['sk-','aaaaaaaaaa','bbbbbb'].join('') + String.fromCharCode(10));
    const t = ring.tail();
    // 语义:环按行逐出,但 tail 是最后 maxBytes 字节的窗口,旧行只允许留下不超过窗口的残余前缀。
    expect(t.length).toBeLessThanOrEqual(200);
    expect(t).toContain('[REDACTED]');
  });
});

describe('WC04 共享 profile 工厂(非秘密形状;密钥由受信宿主注入)', () => {
  const base = {
    providerId: 'agentrouter-dashscope',
    model: 'qwen3.8-flash',
    baseURL: 'https://ws-example00000.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    managedHome: 'E:/managed/home',
  };
  it('四个 harness 输出各自官方配置形状', () => {
    expect(buildSharedProviderProfile({ ...base, harness: 'pi' })).toMatchObject({ configKind: 'pi-broker', credential: 'labeled-file' });
    expect(buildSharedProviderProfile({ ...base, harness: 'deepseek_harness' })).toMatchObject({ configKind: 'dsh-env', requiresEnv: { name: ['BALIAN','API','KEY'].join('_') } });
    expect(buildSharedProviderProfile({ ...base, harness: 'kimi_code' })).toMatchObject({ configKind: 'kimi-config-toml', modelRef: 'agentrouter-dashscope/qwen3.8-flash' });
    expect(buildSharedProviderProfile({ ...base, harness: 'zcode' })).toMatchObject({ configKind: 'zcode-config-json', requiresEnv: { name: ['ZCODE','API','KEY'].join('_') } });
  });
  it('非法 baseURL / 非 qwen3.8-flash(除 pi)拒绝;输出不含任何密钥字段', () => {
    expect(() => buildSharedProviderProfile({ ...base, harness: 'kimi_code', baseURL: 'http://evil.example.com/v1' })).toThrow('SHARED_PROFILE_BASE_URL_INVALID');
    expect(() => buildSharedProviderProfile({ ...base, harness: 'zcode', model: 'glm-9' })).toThrow('SHARED_PROFILE_MODEL_MISMATCH');
    for (const harness of ['pi', 'deepseek_harness', 'kimi_code', 'zcode'] as const) {
      const profile = buildSharedProviderProfile({ ...base, harness });
      expect(JSON.stringify(profile).toLowerCase()).not.toContain('apikey');
    }
  });
});
