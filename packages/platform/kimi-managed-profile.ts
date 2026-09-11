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
`;
const canonical = (path: string) => {
  const actual = existsSync(path) ? realpathSync(path) : resolve(path);
  return process.platform === 'win32' ? actual.toLowerCase() : actual;
};

/** Trusted startup only. Preserve independently refreshed credentials; never inspect their contents. */
export function prepareManagedKimiProfile(input: {
  sessionHome: string;
  credentialSource: string;
}) {
  if (!isAbsolute(input.sessionHome) || !isAbsolute(input.credentialSource))
    throw Error('KIMI_PROFILE_PATH_NOT_ABSOLUTE');
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
  if (canonical(input.credentialSource) === canonical(credentialTarget))
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
  if (!existsSync(credentialTarget)) {
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
  writeFileSync(join(home, 'config.toml'), config, 'utf8');
  writeFileSync(
    agentPath,
    '---\nname: agent\ndescription: AgentRouter managed role\noverride: true\ntools: []\nsubagents: []\n---\nUse only the Route tools supplied for this managed role.\n',
    'utf8',
  );
  return { home, agentPath, credentialCopied };
}
