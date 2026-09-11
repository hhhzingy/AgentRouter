import { afterEach, expect, it } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  symlinkSync,
  linkSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { prepareManagedKimiProfile } from '../../packages/platform/kimi-managed-profile.js';
const roots: string[] = [];
it.each(['credentials/kimi-code.json', 'config.toml', 'agents/agent.md'])(
  'rejects hard-linked %s without changing its source',
  (name) => {
    const f = fixture(),
      prepared = prepareManagedKimiProfile(f);
    const target = join(prepared.home, name),
      source = join(f.root, 'user-owned-fake');
    writeFileSync(source, 'FAKE PRESERVED SOURCE');
    rmSync(target);
    linkSync(source, target);
    expect(() => prepareManagedKimiProfile(f)).toThrow('KIMI_PROFILE_HARDLINK_TARGET');
    expect(readFileSync(source, 'utf8')).toBe('FAKE PRESERVED SOURCE');
  },
);
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});
function fixture() {
  mkdirSync('.local/kimi-profile-tests', { recursive: true });
  const root = mkdtempSync(resolve('.local/kimi-profile-tests/case-'));
  roots.push(root);
  const credentialSource = join(root, 'fake-source.json');
  writeFileSync(credentialSource, 'FAKE CREDENTIAL TEST ONLY');
  return { root, credentialSource, sessionHome: join(root, 'independent') };
}
it('copies only explicit credentials once and creates fixed minimal managed configuration', () => {
  const f = fixture(),
    result = prepareManagedKimiProfile(f);
  expect(result.credentialCopied).toBe(true);
  expect(readFileSync(join(result.home, 'credentials/kimi-code.json'), 'utf8')).toBe(
    'FAKE CREDENTIAL TEST ONLY',
  );
  const config = readFileSync(join(result.home, 'config.toml'), 'utf8');
  expect(config).toContain('base_url = "https://api.kimi.com/coding/v1"');
  expect(config).toContain('key = "oauth/kimi-code"');
  expect(config).toContain('max_context_size = 262144');
  expect(config).toContain('"always_thinking"');
  expect(config).toContain('enabled = true');
  expect(config).not.toContain('services');
  expect(config).not.toContain('FAKE CREDENTIAL');
  expect(readFileSync(result.agentPath, 'utf8')).toContain('tools: []\nsubagents: []');
  expect(result.agentPath).toBe(join(result.home, 'agents/agent.md'));
});
it('preserves native refreshed credentials on subsequent startup even if source disappeared', () => {
  const f = fixture(),
    first = prepareManagedKimiProfile(f);
  writeFileSync(join(first.home, 'credentials/kimi-code.json'), 'FAKE REFRESHED');
  rmSync(f.credentialSource);
  expect(prepareManagedKimiProfile(f).credentialCopied).toBe(false);
  expect(readFileSync(join(first.home, 'credentials/kimi-code.json'), 'utf8')).toBe(
    'FAKE REFRESHED',
  );
});
it('rejects same-path credential sources and relative paths', () => {
  const f = fixture(),
    first = prepareManagedKimiProfile(f);
  expect(() =>
    prepareManagedKimiProfile({
      ...f,
      credentialSource: join(first.home, 'credentials/kimi-code.json'),
    }),
  ).toThrow('KIMI_PROFILE_SOURCE_IS_TARGET');
  expect(() => prepareManagedKimiProfile({ ...f, sessionHome: './relative' })).toThrow(
    'KIMI_PROFILE_PATH_NOT_ABSOLUTE',
  );
});
it('rejects a linked profile directory without writing credentials outside the managed home', () => {
  const f = fixture(),
    outside = join(f.root, 'outside');
  mkdirSync(outside);
  mkdirSync(f.sessionHome);
  symlinkSync(
    outside,
    join(f.sessionHome, '.kimi-code'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  expect(() => prepareManagedKimiProfile(f)).toThrow('KIMI_PROFILE_LINKED_DIRECTORY');
  expect(() => readFileSync(join(outside, 'credentials/kimi-code.json'))).toThrow();
});
