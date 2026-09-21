import { afterEach, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, linkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  managedCodexConfig,
  prepareManagedCodexProfile,
} from '../../packages/platform/codex-managed-profile.js';
const roots: string[] = [];
it.each(['auth.json', 'config.toml'])(
  'rejects hard-linked %s without changing its source',
  (name) => {
    const f = fixture();
    const target = join(f.sessionHome, '.codex', name),
      source = join(f.managedRoot, 'user-owned-fake');
    writeFileSync(source, name === 'config.toml' ? managedCodexConfig : 'FAKE AUTH ONLY');
    rmSync(target, { force: true });
    linkSync(source, target);
    const before = readFileSync(source, 'utf8');
    expect(() => prepareManagedCodexProfile(f)).toThrow('CODEX_PROFILE_HARDLINK_TARGET');
    expect(readFileSync(source, 'utf8')).toBe(before);
  },
);
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});
function fixture() {
  mkdirSync('.local/codex-profile-tests', { recursive: true });
  const managedRoot = mkdtempSync(resolve('.local/codex-profile-tests/case-'));
  roots.push(managedRoot);
  const sessionHome = join(managedRoot, 'dut');
  mkdirSync(join(sessionHome, '.codex'), { recursive: true });
  writeFileSync(join(sessionHome, '.codex/auth.json'), 'FAKE AUTH ONLY');
  const nodeExecutable = join(managedRoot, 'fake-node.bin'),
    roleBridge = join(managedRoot, 'fake-bridge.mjs');
  writeFileSync(nodeExecutable, 'fake node');
  writeFileSync(roleBridge, 'fake bridge');
  const sha = (text: string) => createHash('sha256').update(text).digest('hex');
  return {
    managedRoot,
    sessionHome,
    nodeExecutable,
    nodeSha256: sha('fake node'),
    roleBridge,
    roleBridgeSha256: sha('fake bridge'),
    bridgeEndpoint: 'http://127.0.0.1:30001/tools',
    bridgeToken: 'a'.repeat(64),
  };
}
it('prepares only the independent profile, preserves auth and marks native verification mandatory', () => {
  const f = fixture(),
    result = prepareManagedCodexProfile(f);
  expect(readFileSync(join(result.codexHome, 'auth.json'), 'utf8')).toBe('FAKE AUTH ONLY');
  expect(readFileSync(join(result.codexHome, 'config.toml'), 'utf8')).toBe(managedCodexConfig);
  expect(result.extraArgs.join(' ')).not.toContain(f.bridgeToken);
  expect(result.extraArgs).toContain('features.shell_tool=false');
  expect(result.extraArgs).toContain('web_search="disabled"');
  expect(result.extraArgs.at(-1)).toContain('mcp_servers={ agentrouter-role');
  expect(result.extraArgs.at(-1)).not.toContain('agentrouter-management');
  expect(result.env.CODEX_HOME).toBe(join(f.sessionHome, '.codex'));
  expect(result.requiresNativeBoundaryVerification).toBe(true);
  expect(result.builtInToolsDisabledCertified).toBe(false);
  writeFileSync(join(result.codexHome, 'auth.json'), 'FAKE REFRESHED');
  prepareManagedCodexProfile(f);
  expect(readFileSync(join(result.codexHome, 'auth.json'), 'utf8')).toBe('FAKE REFRESHED');
});
it('refuses existing unknown configuration without overwriting it', () => {
  const f = fixture(),
    config = join(f.sessionHome, '.codex/config.toml');
  writeFileSync(config, '[mcp_servers.agentrouter-management]\ncommand="other"\n');
  expect(() => prepareManagedCodexProfile(f)).toThrow('CODEX_PROFILE_CONFIG_REVIEW_REQUIRED');
  expect(readFileSync(config, 'utf8')).toContain('agentrouter-management');
});
it('rejects unapproved home, missing login, binary drift and non-loopback bridge', () => {
  const f = fixture();
  expect(() => prepareManagedCodexProfile({ ...f, sessionHome: f.managedRoot })).toThrow(
    'CODEX_PROFILE_HOME_SCOPE',
  );
  expect(() => prepareManagedCodexProfile({ ...f, nodeSha256: '0'.repeat(64) })).toThrow(
    'CODEX_PROFILE_BINARY_MISMATCH',
  );
  expect(() =>
    prepareManagedCodexProfile({ ...f, bridgeEndpoint: 'https://evil.invalid/tools' }),
  ).toThrow('CODEX_PROFILE_BRIDGE_INVALID');
  rmSync(join(f.sessionHome, '.codex/auth.json'));
  expect(() => prepareManagedCodexProfile(f)).toThrow('CODEX_MANAGED_LOGIN_REQUIRED');
});
it('login、identity seal 与生产 DUT runner 使用同一受保护 dut-fj 根', () => {
  const login = readFileSync('tools/login-j3-codex-dut.ps1', 'utf8').replaceAll('\\', '/');
  const seal = readFileSync('tools/v11-seal-codex-dut-identity.mjs', 'utf8');
  const runner = readFileSync('tools/test-j3-production-pi.mjs', 'utf8');
  for (const source of [login, seal, runner])
    expect(source).toContain('.local-protected/codex-dut/dut-fj');
  expect(login).not.toContain('.local-protected/codex-dut/home');
  expect(seal).not.toContain('.local-protected/codex-dut/home');
});
