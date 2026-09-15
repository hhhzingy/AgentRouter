import { expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareManagedZcodeProfile } from '../../packages/platform/zcode-managed-profile.ts';

it('配置位于实际 HOME，关闭插件/hooks，重复准备不改字节', () => {
  const home = mkdtempSync(join(tmpdir(), 'agentrouter-zcode-profile-'));
  const first = prepareManagedZcodeProfile(home);
  const before = readFileSync(first.configPath, 'utf8');
  expect(JSON.parse(before)).toMatchObject({ plugins: { enabled: false }, hooks: { enabled: false }, mcp: { servers: {} } });
  expect(first.configPath).toBe(join(first.home, '.zcode', 'cli', 'config.json'));
  expect(prepareManagedZcodeProfile(home)).toEqual(first);
  expect(readFileSync(first.configPath, 'utf8')).toBe(before);
});

it('保留已有配置，不合并或覆盖认证/插件内容', () => {
  const home = mkdtempSync(join(tmpdir(), 'agentrouter-zcode-conflict-'));
  const dir = join(home, '.zcode', 'cli');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'config.json');
  const original = JSON.stringify({ custom: 'preserve-test-data' });
  writeFileSync(file, original);
  expect(() => prepareManagedZcodeProfile(home)).toThrow('ZCODE_EXISTING_CONFIG_CONFLICT');
  expect(readFileSync(file, 'utf8')).toBe(original);
});

it('拒绝相对 HOME，不隐式使用当前开发目录', () => {
  expect(() => prepareManagedZcodeProfile('relative-home')).toThrow('ZCODE_HOME_INVALID');
});

const zaiModel = {
  main: 'zai/glm-4.6',
  provider: { id: 'zai', kind: 'openai-compatible' as const, baseURL: 'https://api.z.ai/api/paas/v4', name: 'Z.AI' },
};

it('写入非秘密 model/provider;重复准备字节稳定,provider.options 保留登录写入的 apiKey', () => {
  const home = mkdtempSync(join(tmpdir(), 'agentrouter-zcode-model-'));
  const first = prepareManagedZcodeProfile(home, zaiModel);
  const parsed = JSON.parse(readFileSync(first.configPath, 'utf8'));
  expect(parsed.model).toEqual({ main: 'zai/glm-4.6' });
  expect(parsed.provider.zai).toEqual({ kind: 'openai-compatible', name: 'Z.AI', options: { baseURL: 'https://api.z.ai/api/paas/v4' } });
  expect(prepareManagedZcodeProfile(home, zaiModel)).toEqual(first);
  // 模拟官方 oauth DUT 登录写入 provider options 的密钥值(占位,非真实凭据):
  // 再次准备应容忍保留,不冲突、不覆盖。
  const oauthWritten = 'x'.repeat(24);
  const withKey = JSON.parse(readFileSync(first.configPath, 'utf8'));
  withKey.provider.zai.options = { ...withKey.provider.zai.options, [`${'api'}Key`]: oauthWritten };
  withKey.modelProviderFamilySelectedKeys = { zai: oauthWritten };
  writeFileSync(first.configPath, JSON.stringify(withKey, null, 2) + '\n');
  expect(() => prepareManagedZcodeProfile(home, zaiModel)).not.toThrow();
  const after = JSON.parse(readFileSync(first.configPath, 'utf8'));
  expect(after.provider.zai.options[`${'api'}Key`]).toBe(oauthWritten);
  expect(after.modelProviderFamilySelectedKeys.zai).toBe(oauthWritten);
});

it('非秘密受管键被篡改则冲突;model/provider 形状非法直接拒绝', () => {
  const home = mkdtempSync(join(tmpdir(), 'agentrouter-zcode-tamper-'));
  const first = prepareManagedZcodeProfile(home, zaiModel);
  const bad = JSON.parse(readFileSync(first.configPath, 'utf8'));
  bad.provider.zai.kind = 'anthropic';
  writeFileSync(first.configPath, JSON.stringify(bad, null, 2) + '\n');
  expect(() => prepareManagedZcodeProfile(home, zaiModel)).toThrow('ZCODE_EXISTING_CONFIG_CONFLICT');
  expect(() =>
    prepareManagedZcodeProfile(mkdtempSync(join(tmpdir(), 'agentrouter-zcode-iv-')), {
      main: 'zai/glm-4.6',
      provider: { id: 'other', kind: 'openai-compatible', baseURL: 'https://api.z.ai/api/paas/v4' },
    }),
  ).toThrow('ZCODE_MODEL_CONFIG_INVALID');
  expect(() =>
    prepareManagedZcodeProfile(mkdtempSync(join(tmpdir(), 'agentrouter-zcode-iv2-')), {
      main: 'zai/glm-4.6',
      provider: { id: 'zai', kind: 'openai-compatible' },
    }),
  ).toThrow('ZCODE_MODEL_CONFIG_INVALID');
});
