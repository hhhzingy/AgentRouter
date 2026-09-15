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
