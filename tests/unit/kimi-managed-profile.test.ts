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
import { prepareManagedKimiProfile, approveManagedKimiRoute } from '../../packages/platform/kimi-managed-profile.js';
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
  expect(config.match(/decision = "allow"/g)).toHaveLength(7);
  expect(config).not.toContain('pattern = "*"');
  expect(config).toContain('[tools]');
  expect(config).not.toContain('FAKE CREDENTIAL');
  const agent = readFileSync(result.agentPath, 'utf8');
  expect(agent).toContain('subagents: []');
  for (const tool of ['route_context','route_send','route_finish','route_wait','route_artifact_write','route_artifact_register','route_artifact_read']) expect(agent).toContain('mcp__agentrouter-role__'+tool);
  expect(agent).not.toMatch(/Bash|ReadFile|mcp__agentrouter-management|mcp__agentrouter-role__\*/);
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

it('approves only one-shot native registered Route names, never display aliases or permanent grants', async()=>{
  const p={toolCall:{toolCallId:'turn:call',title:'mcp__agentrouter-role__route_context'},options:[{kind:'allow_once',optionId:'approve_once'}]};
  expect(await approveManagedKimiRoute(p)).toEqual({outcome:{outcome:'selected',optionId:'approve_once'}});
  for(const title of ['Bash','router_status','route_context','Approve mcp__agentrouter-role__route_context','mcp__agentrouter-management__router_status']) await expect(approveManagedKimiRoute({...p,toolCall:{...p.toolCall,title}})).rejects.toThrow('KIMI_PERMISSION_DENIED');
  await expect(approveManagedKimiRoute({...p,options:[{kind:'allow_always',optionId:'always'}]})).rejects.toThrow('KIMI_PERMISSION_DENIED');
  await expect(approveManagedKimiRoute({...p,options:[...p.options,...p.options]})).rejects.toThrow('KIMI_PERMISSION_DENIED');
});

it('W05 百炼绑定:生成官方 openai-wire provider 形状;非法 base/key/模型拒绝', () => {
  const safeKey = ['DUMMY','NOT','A','KEY','0123456789'].join('-');
  const safeBase = 'https://ws-example00000.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';
  const home = mkdtempSync(resolve('.local/kimi-profile-tests/bailian-' + Math.random().toString(36).slice(2)));
  mkdirSync(home, { recursive: true });
  const good = prepareManagedKimiProfile({
    sessionHome: home,
    bailian: {
      baseURL: safeBase,
      apiKey: safeKey,
      model: 'qwen3.8-flash',
    },
  });
  expect(good.credentialCopied).toBe(false);
  const toml = readFileSync(join(home, '.kimi-code', 'config.toml'), 'utf8');
  expect(toml).toContain('type = "openai"');
  expect(toml).toContain('base_url = "https://ws-example00000.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"');
  expect(toml).toContain('default_model = "bailian/qwen3.8-flash"');
  expect(toml).toContain('mcp__agentrouter-role__route_finish');
  const h2 = mkdtempSync(resolve('.local/kimi-profile-tests/bailian-bad-' + Math.random().toString(36).slice(2)));
  mkdirSync(h2, { recursive: true });
  expect(() =>
    prepareManagedKimiProfile({
      sessionHome: h2,
      bailian: { baseURL: 'https://evil.example.com/v1', apiKey: safeKey, model: 'qwen3.8-flash' },
    }),
  ).toThrow('KIMI_BAILIAN_BINDING_INVALID');
  expect(() =>
    prepareManagedKimiProfile({
      sessionHome: h2,
      bailian: {
        baseURL: safeBase,
        apiKey: 'bad' + String.fromCharCode(34) + 'key' + String.fromCharCode(96) + 'inject' + safeKey,
        model: 'qwen3.8-flash',
      },
    }),
  ).toThrow('KIMI_BAILIAN_BINDING_INVALID');
  expect(() =>
    prepareManagedKimiProfile({
      sessionHome: h2,
      bailian: {
        baseURL: safeBase,
        apiKey: safeKey,
        model: 'glm-9',
      },
    }),
  ).toThrow('KIMI_BAILIAN_BINDING_INVALID');
});
