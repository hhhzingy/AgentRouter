import {
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

const config = `default_model = "kimi-code/kimi-for-coding"
[thinking]
enabled = true
[providers."managed:kimi-code"]
type = "kimi"
base_url = "https://api.kimi.com/coding/v1"
[providers."managed:kimi-code".oauth]
storage = "file"
key = "oauth/kimi-code"
[models."kimi-code/kimi-for-coding"]
provider = "managed:kimi-code"
model = "kimi-for-coding"
max_context_size = 262144
capabilities = ["thinking", "always_thinking", "image_in", "video_in", "tool_use"]
display_name = "K2.7 Coding"
[tools]
enabled = ["mcp__agentrouter-role__route_context", "mcp__agentrouter-role__route_send", "mcp__agentrouter-role__route_finish", "mcp__agentrouter-role__route_wait", "mcp__agentrouter-role__route_artifact_write", "mcp__agentrouter-role__route_artifact_register", "mcp__agentrouter-role__route_artifact_read"]
[[permission.rules]]
decision = "allow"
pattern = "mcp__agentrouter-role__route_context"
[[permission.rules]]
decision = "allow"
pattern = "mcp__agentrouter-role__route_send"
[[permission.rules]]
decision = "allow"
pattern = "mcp__agentrouter-role__route_finish"
[[permission.rules]]
decision = "allow"
pattern = "mcp__agentrouter-role__route_wait"
[[permission.rules]]
decision = "allow"
pattern = "mcp__agentrouter-role__route_artifact_write"
[[permission.rules]]
decision = "allow"
pattern = "mcp__agentrouter-role__route_artifact_register"
[[permission.rules]]
decision = "allow"
pattern = "mcp__agentrouter-role__route_artifact_read"
`;
// W05 百炼绑定:kimi-code 官方 openai-wire provider 形状(catalog add alibaba-cn 产出)。
// base_url 为 MaaS compatible-mode;api_key 是 kimi 官方存储位置(config.toml),写前严格校验防 TOML 注入。
const BAILIAN_BASE_RE = /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.cn-[a-z]+\.maas\.aliyuncs\.com\/compatible-mode\/v1$/;
const BAILIAN_KEY_RE = /^[A-Za-z0-9._-]{8,512}$/;
function bailianConfig(baseURL: string, apiKey: string, model: string) {
  if (!BAILIAN_BASE_RE.test(baseURL) || !BAILIAN_KEY_RE.test(apiKey) || model !== 'qwen3.8-flash')
    throw Error('KIMI_BAILIAN_BINDING_INVALID');
  const ref = 'bailian/' + model;
  return `default_model = "${ref}"
[thinking]
enabled = true
[providers."bailian"]
type = "openai"
base_url = "${baseURL}"
api_key = "${apiKey}"
[models."${ref}"]
provider = "bailian"
model = "${model}"
max_context_size = 1000000
max_output_size = 65536
capabilities = [ "thinking", "tool_use", "image_in" ]
display_name = "Qwen3.8 Flash (Bailian)"
`;
}
const toolsTail = `[tools]
enabled = ["mcp__agentrouter-role__route_context", "mcp__agentrouter-role__route_send", "mcp__agentrouter-role__route_finish", "mcp__agentrouter-role__route_wait", "mcp__agentrouter-role__route_artifact_write", "mcp__agentrouter-role__route_artifact_register", "mcp__agentrouter-role__route_artifact_read"]
[[permission.rules]]
decision = "allow"
pattern = "mcp__agentrouter-role__route_context"
[[permission.rules]]
decision = "allow"
pattern = "mcp__agentrouter-role__route_send"
[[permission.rules]]
decision = "allow"
pattern = "mcp__agentrouter-role__route_finish"
[[permission.rules]]
decision = "allow"
pattern = "mcp__agentrouter-role__route_wait"
[[permission.rules]]
decision = "allow"
pattern = "mcp__agentrouter-role__route_artifact_write"
[[permission.rules]]
decision = "allow"
pattern = "mcp__agentrouter-role__route_artifact_register"
[[permission.rules]]
decision = "allow"
pattern = "mcp__agentrouter-role__route_artifact_read"
`;
const canonical = (path: string) => {
  const actual = existsSync(path) ? realpathSync(path) : resolve(path);
  return process.platform === 'win32' ? actual.toLowerCase() : actual;
};

/** Trusted startup only. Preserve independently refreshed credentials; never inspect their contents. */
export function prepareManagedKimiProfile(input: {
  sessionHome: string;
  /** kimi 官方 oauth 凭据(kimi-code.json);与 bailian 二选一。 */
  credentialSource?: string;
  /** W05 百炼绑定(官方 openai-wire provider 形状);给出则不写 oauth 凭据。 */
  bailian?: { baseURL: string; apiKey: string; model: string };
}) {
  if (!isAbsolute(input.sessionHome) || (!input.bailian && !input.credentialSource))
    throw Error('KIMI_PROFILE_PATH_NOT_ABSOLUTE');
  if (input.bailian && input.credentialSource) throw Error('KIMI_PROFILE_SOURCE_CONFLICT');
  const home = join(input.sessionHome, '.kimi-code');
  const credentials = join(home, 'credentials');
  const credentialTarget = join(credentials, 'kimi-code.json');
  const assertSingleLink = (target: string) => {
    if (existsSync(target)) {
      const stat = lstatSync(target);
      if (stat.isFile() && stat.nlink !== 1) throw Error('KIMI_PROFILE_HARDLINK_TARGET');
    }
  };
  for (const target of [
    credentialTarget,
    join(home, 'config.toml'),
    join(home, 'agents', 'agent.md'),
  ])
    assertSingleLink(target);
  if (input.credentialSource && canonical(input.credentialSource) === canonical(credentialTarget))
    throw Error('KIMI_PROFILE_SOURCE_IS_TARGET');
  // Reject pre-existing linked directories that escape the explicitly selected independent home.
  if (
    canonical(home) !==
      canonical(input.sessionHome) + (process.platform === 'win32' ? '\\' : '/') + '.kimi-code' ||
    canonical(credentials) !==
      canonical(home) + (process.platform === 'win32' ? '\\' : '/') + 'credentials'
  )
    throw Error('KIMI_PROFILE_LINKED_DIRECTORY');
  mkdirSync(credentials, { recursive: true });
  let credentialCopied = false;
  if (input.credentialSource && !existsSync(credentialTarget)) {
    try {
      copyFileSync(input.credentialSource, credentialTarget, constants.COPYFILE_EXCL);
      credentialCopied = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
        throw Error('KIMI_PROFILE_COPY_FAILED');
    }
  }
  for (const target of [credentialTarget, join(home, 'config.toml'), join(home, 'agents')]) {
    if (
      existsSync(target) &&
      canonical(target) !==
        (process.platform === 'win32' ? resolve(target).toLowerCase() : resolve(target))
    )
      throw Error('KIMI_PROFILE_LINKED_TARGET');
  }
  mkdirSync(join(home, 'agents'), { recursive: true });
  const agentPath = join(home, 'agents', 'agent.md');
  for (const target of [credentialTarget, join(home, 'config.toml'), agentPath])
    assertSingleLink(target);
  if (
    existsSync(agentPath) &&
    canonical(agentPath) !==
      (process.platform === 'win32' ? resolve(agentPath).toLowerCase() : resolve(agentPath))
  )
    throw Error('KIMI_PROFILE_LINKED_TARGET');
  writeFileSync(
    join(home, 'config.toml'),
    input.bailian
      ? bailianConfig(input.bailian.baseURL, input.bailian.apiKey, input.bailian.model) + toolsTail
      : config,
    'utf8',
  );
  writeFileSync(
    agentPath,
    '---\nname: agent\ndescription: AgentRouter managed role\noverride: true\ntools: [mcp__agentrouter-role__route_context, mcp__agentrouter-role__route_send, mcp__agentrouter-role__route_finish, mcp__agentrouter-role__route_wait, mcp__agentrouter-role__route_artifact_write, mcp__agentrouter-role__route_artifact_register, mcp__agentrouter-role__route_artifact_read]\nsubagents: []\n---\nUse only the Route tools supplied for this managed role.\n',
    'utf8',
  );
  return { home, agentPath, credentialCopied };
}

/** Kimi Code 0.42.0 ACP constructs title from registered req.toolName, never tool arguments.
 * Only the hash-pinned native host may install this callback; Core still authorizes each Route call.
 */
export async function approveManagedKimiRoute(params: unknown) {
  const p = params as any;
  const names = ['route_context','route_send','route_finish','route_wait','route_artifact_write','route_artifact_register','route_artifact_read'].map(n=>'mcp__agentrouter-role__'+n);
  if (!p || !names.includes(p.toolCall?.title) || typeof p.toolCall?.toolCallId !== 'string' || !p.toolCall.toolCallId || !Array.isArray(p.options)) throw Error('KIMI_PERMISSION_DENIED');
  const once = p.options.filter((o:any)=>o?.kind==='allow_once' && o.optionId==='approve_once');
  if (once.length!==1) throw Error('KIMI_PERMISSION_DENIED');
  return {outcome:{outcome:'selected',optionId:once[0].optionId}};
}
