import { readFileSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute, join, relative, sep } from 'node:path';
import type { ApplicationService } from '../core-service/application.ts';
import { NativeExecutionRegistry } from '../core-service/native-registry.ts';
import { NativeProcessBackend } from '../core-service/native-process-backend.ts';
import { NativeSessionStore } from '../core-service/native-session-store.ts';
import {
  registerTrustedRole,
  type TrustedNativeProfile,
} from '../core-service/trusted-native-registration.ts';
import { WindowsNativeProcessHost } from './windows-native-process-host.ts';
import { createNativeRoleBridge } from '../role-bridge/native-server.ts';
import { ApprovedProvider, deepSeekPolicy } from '../security/approved-provider.ts';
import { createPiProviderBroker } from './pi-provider-broker.ts';

interface Config {
  isolation: 'LIMITED_ISOLATION';
  managedRoot: string;
  workspaceRoot: string;
  supervisorExecutable: string;
  supervisorSha256: string;
  piEntry: string;
  piEntrySha256: string;
  piExtension: string;
  piExtensionSha256: string;
  credentialFile: string;
  profiles: TrustedNativeProfile[];
}
const sha = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
function inside(root: string, path: string) {
  const rel = relative(realpathSync(root), realpathSync(path));
  return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
}
/** Opt-in owner configuration. This is never accepted from MCP/model/renderer payloads. */
export async function installLocalNativeRuntime(
  app: ApplicationService,
  registry: NativeExecutionRegistry,
  filename: string,
) {
  if (!isAbsolute(filename)) throw Error('NATIVE_CONFIG_PATH_INVALID');
  const c = JSON.parse(readFileSync(filename, 'utf8')) as Config;
  if (
    c.isolation !== 'LIMITED_ISOLATION' ||
    !Array.isArray(c.profiles) ||
    !c.profiles.length ||
    ![
      c.managedRoot,
      c.workspaceRoot,
      c.supervisorExecutable,
      c.piEntry,
      c.piExtension,
      c.credentialFile,
    ].every(isAbsolute)
  )
    throw Error('NATIVE_RUNTIME_CONFIG_INVALID');
  for (const [file, hash] of [
    [c.supervisorExecutable, c.supervisorSha256],
    [c.piEntry, c.piEntrySha256],
    [c.piExtension, c.piExtensionSha256],
  ])
    if (!/^[a-f0-9]{64}$/.test(hash) || sha(file) !== hash)
      throw Error('NATIVE_RUNTIME_HASH_MISMATCH');
  for (const p of c.profiles) {
    if (
      p.harness !== 'pi' ||
      p.providerId !== 'agentrouter-deepseek' ||
      p.modelId !== 'deepseek-v4-flash' ||
      p.effort !== 'off' ||
      !isAbsolute(p.sessionHome) ||
      !isAbsolute(p.executable) ||
      sha(p.executable) !== p.executableSha256
    )
      throw Error('NATIVE_PROFILE_NOT_SUPPORTED');
    mkdirSync(p.sessionHome, { recursive: true });
    if (
      !inside(c.managedRoot, p.sessionHome) ||
      realpathSync(c.managedRoot) === realpathSync(p.sessionHome)
    )
      throw Error('NATIVE_HOME_SCOPE');
  }
  const bridge = await createNativeRoleBridge();
  const sessions = new NativeSessionStore(app.db);
  const host = new WindowsNativeProcessHost({
    isolation: c.isolation,
    managedRoot: c.managedRoot,
    supervisorExecutable: c.supervisorExecutable,
    supervisorSha256: c.supervisorSha256,
    prepare: async (input) => {
      if (sha(c.piExtension) !== c.piExtensionSha256) throw Error('NATIVE_EXTENSION_HASH_MISMATCH');
      if (!inside(c.workspaceRoot, input.config.workspace)) throw Error('NATIVE_WORKSPACE_SCOPE');
      const home = input.config.sessionHome;
      for (const path of ['.pi', 'sessions', 'tmp', 'bin'])
        mkdirSync(join(home, path), { recursive: true });
      const scope = { bindingId: input.bindingId, epoch: input.epoch, sessionHome: home };
      const session = sessions.load(scope);
      // Read the explicitly authorized source only inside the trusted provider, never into child env.
      const provider = new ApprovedProvider({ ...deepSeekPolicy, timeoutMs: 60000 }, async () => {
        const keys = [
          ...new Set(readFileSync(c.credentialFile, 'utf8').match(/sk-[A-Za-z0-9_-]{16,}/g) ?? []),
        ];
        if (keys.length !== 1) throw Error('CREDENTIAL_FORMAT_UNRECOGNIZED');
        return keys[0];
      });
      const broker = await createPiProviderBroker(provider);
      const token = bridge.issue(input.handleTool);
      const { capability } = broker; // Generated loopback capability, never the upstream credential.
      const modelPath = join(home, '.pi', 'models.json');
      try {
        writeFileSync(
          modelPath,
          JSON.stringify({
            providers: {
              'agentrouter-deepseek': {
                baseUrl: broker.baseUrl,
                api: 'openai-completions',
                apiKey: capability,
                compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
                models: [
                  {
                    id: 'deepseek-v4-flash',
                    name: 'DeepSeek',
                    reasoning: false,
                    input: ['text'],
                    contextWindow: 65536,
                    maxTokens: 1024,
                  },
                ],
              },
            },
          }),
        );
        return {
          env: {
            SystemRoot: process.env.SystemRoot,
            WINDIR: process.env.WINDIR,
            PATH: join(home, 'bin'),
            PI_CODING_AGENT_SESSION_DIR: join(home, 'sessions'),
            PI_OFFLINE: '1',
            PI_TELEMETRY: '0',
            PI_SKIP_VERSION_CHECK: '1',
            AGENTROUTER_BRIDGE_ENDPOINT: bridge.endpoint,
            AGENTROUTER_BRIDGE_TOKEN: token,
          },
          nodeEntrypoint: { path: c.piEntry, sha256: c.piEntrySha256 },
          extraArgs: [
            '--no-builtin-tools',
            '--no-extensions',
            '--no-skills',
            '--no-prompt-templates',
            '--no-themes',
            '--extension',
            c.piExtension,
          ],
          session,
          revoke: () => {
            bridge.revoke(token);
          },
          dispose: async () => {
            await broker.close();
          },
          saveSession: async (ref, guard) => {
            sessions.save({ ...scope, key: input.key, isCurrent: guard.isCurrent }, ref);
          },
        };
      } catch (error) {
        bridge.revoke(token);
        await broker.close();
        throw error;
      }
    },
  });
  const backend = new NativeProcessBackend(host);
  registry.attach('pi', {
    backend,
    cancelSupported: true,
    authorize: (config) =>
      c.profiles.some(
        (p) =>
          p.id === config.profileRef &&
          [
            'harness',
            'executable',
            'executableSha256',
            'version',
            'providerId',
            'modelId',
            'effort',
            'sessionHome',
          ].every(
            (key) => p[key as keyof TrustedNativeProfile] === config[key as keyof typeof config],
          ),
      ) && inside(c.workspaceRoot, config.workspace),
    authorizeTool: (_c, _b, _e, tool) =>
      [
        'route_context',
        'route_send',
        'route_finish',
        'route_wait',
        'route_artifact_register',
        'route_artifact_read',
      ].includes(tool),
  });
  app.onRoleCreated = (role) => {
    registerTrustedRole(app, registry, role, c.profiles);
  };
  app.trustedToolProfiles = new Set([
    'route_context',
    'route_send',
    'route_finish',
    'route_wait',
    'route_artifact_register',
    'route_artifact_read',
  ]);
  return {
    close: async () => {
      await backend.stop();
      await bridge.close();
    },
  };
}
