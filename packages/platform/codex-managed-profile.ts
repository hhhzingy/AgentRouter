import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

export const managedCodexConfig =
  'cli_auth_credentials_store = "file"\nsandbox_mode = "read-only"\napproval_policy = "never"\n[features]\napps = false\nplugins = false\nremote_plugin = false\n';
const routeTools = [
  'route_context',
  'route_send',
  'route_finish',
  'route_wait',
  'route_artifact_register',
  'route_artifact_read',
];
const quote = (value: string) => JSON.stringify(value);
/** Only prepares trusted configuration. The caller must verify native identity, MCP inventory and tool policy before dispatch. */
export function prepareManagedCodexProfile(input: {
  managedRoot: string;
  sessionHome: string;
  nodeExecutable: string;
  nodeSha256: string;
  roleBridge: string;
  roleBridgeSha256: string;
  bridgeEndpoint: string;
  bridgeToken: string;
}) {
  if (
    ![input.managedRoot, input.sessionHome, input.nodeExecutable, input.roleBridge].every(
      isAbsolute,
    )
  )
    throw Error('CODEX_PROFILE_PATH_INVALID');
  const root = realpathSync(input.managedRoot);
  // No directory creation until an existing independent home is checked against the owner scope.
  const home = realpathSync(input.sessionHome);
  const rel = relative(root, home);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel))
    throw Error('CODEX_PROFILE_HOME_SCOPE');
  for (const [file, expected] of [
    [input.nodeExecutable, input.nodeSha256],
    [input.roleBridge, input.roleBridgeSha256],
  ]) {
    if (
      !/^[a-f0-9]{64}$/.test(expected) ||
      createHash('sha256').update(readFileSync(file)).digest('hex') !== expected
    )
      throw Error('CODEX_PROFILE_BINARY_MISMATCH');
  }
  let endpoint: URL;
  try {
    endpoint = new URL(input.bridgeEndpoint);
  } catch {
    throw Error('CODEX_PROFILE_BRIDGE_INVALID');
  }
  if (
    endpoint.protocol !== 'http:' ||
    endpoint.hostname !== '127.0.0.1' ||
    !endpoint.port ||
    endpoint.pathname !== '/tools' ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.username ||
    endpoint.password ||
    !/^[a-f0-9]{64}$/.test(input.bridgeToken)
  )
    throw Error('CODEX_PROFILE_BRIDGE_INVALID');
  const codexHome = join(home, '.codex');
  const assertPlain = (path: string) => {
    if (existsSync(path)) {
      const stat = lstatSync(path);
      if (stat.isFile() && stat.nlink !== 1) throw Error('CODEX_PROFILE_HARDLINK_TARGET');
    }
    if (
      existsSync(path) &&
      (lstatSync(path).isSymbolicLink() || realpathSync(path).toLowerCase() !== path.toLowerCase())
    )
      throw Error('CODEX_PROFILE_LINKED_PATH');
  };
  assertPlain(codexHome);
  const auth = join(codexHome, 'auth.json');
  assertPlain(auth);
  if (!existsSync(auth) || !lstatSync(auth).isFile()) throw Error('CODEX_MANAGED_LOGIN_REQUIRED');
  const config = join(codexHome, 'config.toml');
  assertPlain(config);
  if (existsSync(config)) {
    if (readFileSync(config, 'utf8') !== managedCodexConfig)
      throw Error('CODEX_PROFILE_CONFIG_REVIEW_REQUIRED');
  } else writeFileSync(config, managedCodexConfig, { encoding: 'utf8', flag: 'wx' });
  for (const name of ['tmp', 'bin']) {
    const path = join(home, name);
    assertPlain(path);
    mkdirSync(path, { recursive: true });
  }
  // Replace the complete MCP table at highest CLI precedence, not just one server subsection.
  // Tokens remain in the private child environment rather than process arguments or config files.
  const approvals=routeTools.map(tool=>`${tool} = { approval_mode = "approve" }`).join(', ');
  const mcp = `{ agentrouter-role = { command = ${quote(input.nodeExecutable)}, args = [${quote(input.roleBridge)}], env_vars = ["AGENTROUTER_BRIDGE_ENDPOINT", "AGENTROUTER_BRIDGE_TOKEN"], enabled_tools = [${routeTools.map(quote).join(', ')}], default_tools_approval_mode = "prompt", tools = { ${approvals} }, required = true } }`;
  return {
    codexHome,
    env: {
      HOME: home,
      USERPROFILE: home,
      CODEX_HOME: codexHome,
      PATH: join(home, 'bin'),
      TEMP: join(home, 'tmp'),
      TMP: join(home, 'tmp'),
      AGENTROUTER_MANAGED_ROLE: '1',
      AGENTROUTER_BRIDGE_ENDPOINT: input.bridgeEndpoint,
      AGENTROUTER_BRIDGE_TOKEN: input.bridgeToken,
    },
    extraArgs: [
      '-c',
      'cli_auth_credentials_store="file"',
      '-c',
      'features.shell_tool=false',
      '-c',
      'web_search="disabled"',
      '-c',
      `mcp_servers=${mcp}`,
    ],
    expectedMcpServerNames: ['agentrouter-role'],
    requiresNativeBoundaryVerification: true as const,
    builtInToolsDisabledCertified: false as const,
  };
}
