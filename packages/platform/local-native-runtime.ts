import { setAllowedHarnesses } from '../runtime/management.ts';
import { transitionWorkSessionBinding } from '../core-service/work-session-transition.ts';
import { existsSync, readFileSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute, join, relative, sep } from 'node:path';
import type { ApplicationService } from '../core-service/application.ts';
import { NativeExecutionRegistry } from '../core-service/native-registry.ts';
import { NativeProcessBackend } from '../core-service/native-process-backend.ts';
import { builtInDrivers } from '../core-service/harness-drivers.ts';
import { NativeSessionStore } from '../core-service/native-session-store.ts';
import {
  registerTrustedRole,
  type TrustedNativeProfile,
} from '../core-service/trusted-native-registration.ts';
import { WindowsNativeProcessHost } from './windows-native-process-host.ts';
import { createNativeRoleBridge } from '../role-bridge/native-server.ts';
import { ApprovedProvider, deepSeekPolicy } from '../security/approved-provider.ts';
import { parseLabeledCredential } from '../security/labeled-credential.ts';
import { createPiProviderBroker } from './pi-provider-broker.ts';
import { prepareManagedKimiProfile, approveManagedKimiRoute } from './kimi-managed-profile.ts';
import { prepareManagedCodexProfile } from './codex-managed-profile.ts';
import { prepareManagedZcodeProfile, zcodeApiKeyPattern, type ZcodeModelProviderConfig } from './zcode-managed-profile.ts';

interface Config {
  dshHome?: string;
  dshBin?: string;
  zcodeCli?: string;
  /** 非秘密 ZCode model/provider allowlist 设置(owner 配置,绝不经 MCP/model/renderer 传入)。 */
  zcodeProvider?: ZcodeModelProviderConfig;
  /** owner 授权的 ZCode API key 文件;存在即注入 env 认证(apiKey 模式)。缺失时由官方 oauth DUT 登录。 */
  zcodeCredentialFile?: string;
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
  kimiCredentialSource?: string;
  /** pi→百炼绑定(owner 配置):指定凭据文件(标签格式)与 provider 身份;缺省保持 agentrouter-deepseek。 */
  piProvider?: { providerId: string; modelId: string; contextWindowTokens: number; maxOutputTokens: number };
  piCredentialFile?: string;
  /** dsh→百炼:标注凭据文件(dsh settings 官方 balian provider,BALIAN_API_KEY)。 */
  dshCredentialFile?: string;
  /** kimi→百炼:标注凭据文件(kimi-code 官方 openai-wire provider 形状;model 固定 qwen3.8-flash)。 */
  kimiBailianCredentialFile?: string;
  codexApprovedIdentityFile?: string;
  roleBridge?: string;
  roleBridgeSha256?: string;
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
    const piOk =
      (p.harness === 'pi' &&
        p.providerId === (c.piProvider?.providerId ?? 'agentrouter-deepseek') &&
        p.modelId === (c.piProvider ? c.piProvider.modelId : 'deepseek-v4-flash') &&
        p.effort === 'off');
    const dshOk =
      p.harness === 'deepseek_harness' &&
      p.effort === 'off' &&
      ((p.providerId === 'agentrouter-deepseek' && p.modelId === 'deepseek-v4-flash') ||
        (c.piProvider !== undefined && c.dshCredentialFile !== undefined && p.providerId === 'agentrouter-dashscope' && p.modelId === 'qwen3.8-flash'));
    // W05 kimi→百炼:官方 openai-wire provider(catalog add alibaba-cn 形状),模型固定 qwen3.8-flash。
    const kimiOk =
      p.harness === 'kimi_code' &&
      ((p.providerId === 'agentrouter-kimi' &&
        p.modelId === 'kimi-code/kimi-for-coding' &&
        p.effort === 'on') ||
        (!!c.kimiBailianCredentialFile &&
          p.providerId === 'agentrouter-bailian' &&
          p.modelId === 'bailian/qwen3.8-flash' &&
          p.effort === 'on'));
    if (
      !((piOk) || (kimiOk) || (p.harness==='codex' && p.providerId==='agentrouter-codex' && p.modelId==='gpt-5.6-luna' && p.effort==='low') || (p.harness==='zcode' && p.providerId==='agentrouter-zcode' && p.modelId==='zcode-managed' && p.effort==='off') || (dshOk)) ||
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
    zcodeCli: c.zcodeCli,
    dshBin: c.dshBin,
    prepare: async (input) => {
      if (sha(c.piExtension) !== c.piExtensionSha256) throw Error('NATIVE_EXTENSION_HASH_MISMATCH');
      if (!inside(c.workspaceRoot, input.config.workspace)) throw Error('NATIVE_WORKSPACE_SCOPE');
      const home = input.config.sessionHome;
      for (const path of ['.pi', 'sessions', 'tmp', 'bin'])
        mkdirSync(join(home, path), { recursive: true });
      const scope = {
        bindingId: input.bindingId,
        epoch: input.epoch,
        sessionHome: home,
        ...(input.roleSessionId ? { roleSessionId: input.roleSessionId } : {}),
      };
      const session = sessions.load(scope);
      if(input.config.harness==='codex') {
        if(!c.codexApprovedIdentityFile || !inside(c.managedRoot,c.codexApprovedIdentityFile) || !c.roleBridge || !c.roleBridgeSha256)throw Error('CODEX_RUNTIME_CONFIG_INVALID');
        const token=bridge.issue(input.handleTool);
        try {
          const prepared=prepareManagedCodexProfile({managedRoot:c.managedRoot,sessionHome:home,nodeExecutable:process.execPath,nodeSha256:sha(process.execPath),roleBridge:c.roleBridge,roleBridgeSha256:c.roleBridgeSha256,bridgeEndpoint:bridge.endpoint,bridgeToken:token});
          return {
            env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,...prepared.env},extraArgs:prepared.extraArgs,session,
            revoke:()=>bridge.revoke(token),
            verifyCodex:async(request:(method:string,params:unknown)=>Promise<any>)=>{
              const effective=await request('config/read',{cwd:input.config.workspace,includeLayers:false});
              if(effective.config?.features?.shell_tool!==false || effective.config?.web_search!=='disabled' || effective.config?.sandbox_mode!=='read-only' || effective.config?.approval_policy!=='never')throw Error('CODEX_NATIVE_POLICY_MISMATCH');
              const mcp=await request('mcpServerStatus/list',{});
              const expected=['route_context','route_send','route_finish','route_wait','route_artifact_register','route_artifact_read'].sort();
              if(!expected.every(t=>effective.config?.mcp_servers?.['agentrouter-role']?.tools?.[t]?.approval_mode==='approve'))throw Error('CODEX_ROUTE_APPROVAL_MISMATCH');
              if(mcp.nextCursor || mcp.data?.length!==1 || mcp.data[0].name!=='agentrouter-role' || JSON.stringify(Object.keys(mcp.data[0].tools??{}).sort())!==JSON.stringify(expected))throw Error('CODEX_MCP_BOUNDARY_MISMATCH');
              const approved=JSON.parse(readFileSync(c.codexApprovedIdentityFile!,'utf8'));
              const current=JSON.parse(readFileSync(join(prepared.codexHome,'auth.json'),'utf8'));
              const claims=JSON.parse(Buffer.from(current.tokens.id_token.split('.')[1],'base64url').toString('utf8'));
              const identity=await request('account/read',{refreshToken:false});
              const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
              if(typeof identity.account?.email!=='string' || hash(identity.account.email.trim().toLowerCase())!==approved.emailSha256 || hash(current.tokens.account_id)!==approved.accountIdSha256 || hash(claims.sub)!==approved.subjectSha256)throw Error('CODEX_DUT_IDENTITY_MISMATCH');
              const models=await request('model/list',{}),model=models.data?.find((m:any)=>m.model===input.config.modelId);
              const efforts=model?.supportedReasoningEfforts?.map((e:any)=>e.reasoningEffort)??[];
              if(['none','minimal','low','medium','high','xhigh','max'].find(e=>efforts.includes(e))!==input.config.effort)throw Error('CODEX_MODEL_EFFORT_UNVERIFIED');
            },
            saveSession:async(ref:any,guard:any)=>{sessions.save({...scope,key:input.key,isCurrent:guard.isCurrent},ref);},
          };
        } catch(error){bridge.revoke(token);throw error;}
      }
      if (input.config.harness === 'zcode') {
        if (input.config.version !== '0.16.5') throw Error('ZCODE_VERSION_UNVERIFIED');
        if (!c.zcodeCli || !isAbsolute(c.zcodeCli)) throw Error('ZCODE_RUNTIME_CONFIG_INVALID');
        if (!c.roleBridge || !isAbsolute(c.roleBridge) || sha(c.roleBridge) !== c.roleBridgeSha256)
          throw Error('ZCODE_ROLE_BRIDGE_INVALID');
        if (!c.zcodeProvider) throw Error('ZCODE_MODEL_CONFIG_REQUIRED');
        // 受管隔离:沙箱HOME+受管env;非秘密 model/provider 由 owner 配置写入受管 config.json。
        // Windows 宿主强制 HOME/USERPROFILE=sessionHome;配置必须写到同一个根。
        const { home: zhome } = prepareManagedZcodeProfile(home, c.zcodeProvider);
        // apiKey 模式:owner 授权文件仅在此读取,注入 env 后不落日志/配置;缺失则依赖官方 oauth DUT 登录。
        let zcodeKey: string | undefined;
        if (c.zcodeCredentialFile) {
          if (!isAbsolute(c.zcodeCredentialFile)) throw Error('ZCODE_CREDENTIAL_PATH_INVALID');
          const text = existsSync(c.zcodeCredentialFile) ? readFileSync(c.zcodeCredentialFile, 'utf8') : '';
          const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
          const candidate = lines[0] ?? '';
          if (lines.some((l) => /^api_key$/i.test(l)) && lines.some((l) => /^https?:\/\//.test(l))) {
            // W05 百炼绑定:标签格式凭据(base_url/api_key/model);模型须与 owner 配置的 qwen3.8-flash 一致。
            const cred = parseLabeledCredential(text);
            if (cred.model && cred.model !== 'qwen3.8-flash') throw Error('ZCODE_BAILIAN_MODEL_MISMATCH');
            if (!zcodeApiKeyPattern.test(cred.apiKey)) throw Error('ZCODE_CREDENTIAL_FORMAT_UNRECOGNIZED');
            zcodeKey = cred.apiKey;
          } else {
            if (candidate && !zcodeApiKeyPattern.test(candidate)) throw Error('ZCODE_CREDENTIAL_FORMAT_UNRECOGNIZED');
            zcodeKey = candidate || undefined;
          }
        }
        const token = bridge.issue(input.handleTool);
        return {
          env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PATH:join(home,'bin'),USERPROFILE:zhome,HOME:zhome,APPDATA:join(zhome,'AppData','Roaming'),LOCALAPPDATA:join(zhome,'AppData','Local'),AGENTROUTER_MANAGED_ROLE:'1',...(zcodeKey?{ZCODE_API_KEY:zcodeKey}:{})},
          revoke:()=>bridge.revoke(token),
          mcpServers:[{name:'agentrouter-role',command:process.execPath,args:[c.roleBridge],env:[{name:'AGENTROUTER_BRIDGE_ENDPOINT',value:bridge.endpoint},{name:'AGENTROUTER_BRIDGE_TOKEN',value:token}]}],
          session,
          saveSession:async(ref,guard)=>{sessions.save({...scope,key:input.key,isCurrent:guard.isCurrent},ref);},
        };
      }
      if (input.config.harness === 'deepseek_harness') {
        if (input.config.version !== '0.1.5-rc.1') throw Error('DSH_VERSION_UNVERIFIED');
        if (!c.dshBin || !isAbsolute(c.dshBin)) throw Error('DSH_RUNTIME_CONFIG_INVALID');
        const dshHome = c.dshHome ?? join(home, '.dsh');
        if (!existsSync(join(dshHome, 'profiles'))) throw Error('NATIVE_CREDENTIALS_REQUIRED');
        // 百炼官方路径:dsh settings.yaml 内置 balian provider(apiKeyEnv=BALIAN_API_KEY);注入标注密钥即可。
        let dshEnv: Record<string, string | undefined> = { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: join(home, 'bin'), DSH_HOME: dshHome };
        if (c.dshCredentialFile && c.piProvider) {
          if (!isAbsolute(c.dshCredentialFile)) throw Error('DSH_CREDENTIAL_PATH_INVALID');
          const cred = parseLabeledCredential(readFileSync(c.dshCredentialFile, 'utf8'));
          dshEnv = { ...dshEnv, BALIAN_API_KEY: cred.apiKey };
        } else {
          const keyText = existsSync(c.credentialFile) ? readFileSync(c.credentialFile, 'utf8') : '';
          const dshKey = keyText.match(/sk-[A-Za-z0-9_-]{16,}/)?.[0];
          if (!dshKey) throw Error('NATIVE_CREDENTIALS_REQUIRED');
          dshEnv = { ...dshEnv, DEEPSEEK_API_KEY: dshKey };
        }
        const token = bridge.issue(input.handleTool);
        return {
          env: dshEnv,
          mcpServers:[{name:'agentrouter-role',command:process.execPath,args:[c.roleBridge],env:[{name:'AGENTROUTER_BRIDGE_ENDPOINT',value:bridge.endpoint},{name:'AGENTROUTER_BRIDGE_TOKEN',value:token}]}],
          approveKimi:approveManagedKimiRoute,
          session,
          revoke:()=>bridge.revoke(token),
          saveSession:async(ref,guard)=>{sessions.save({...scope,key:input.key,isCurrent:guard.isCurrent},ref);},
        };
      }
      if (input.config.harness === 'kimi_code') {
        if(input.config.version!=='0.42.0') throw Error('KIMI_PERMISSION_VERSION_UNVERIFIED');
        if (!c.roleBridge || !isAbsolute(c.roleBridge) || sha(c.roleBridge) !== c.roleBridgeSha256) throw Error('KIMI_RUNTIME_CONFIG_INVALID');
        let kimiProfile;
        if (c.kimiBailianCredentialFile) {
          // W05 百炼绑定:标签凭据 → 官方 openai-wire provider;不触碰桌面 oauth 凭据。
          if (!isAbsolute(c.kimiBailianCredentialFile)) throw Error('KIMI_BAILIAN_CREDENTIAL_PATH_INVALID');
          const cred = parseLabeledCredential(readFileSync(c.kimiBailianCredentialFile, 'utf8'));
          if (cred.model !== 'qwen3.8-flash') throw Error('KIMI_BAILIAN_MODEL_MISMATCH');
          kimiProfile = prepareManagedKimiProfile({ sessionHome: home, bailian: { baseURL: cred.baseUrl, apiKey: cred.apiKey, model: 'qwen3.8-flash' } });
        } else {
          if (!c.kimiCredentialSource || !isAbsolute(c.kimiCredentialSource)) throw Error('KIMI_RUNTIME_CONFIG_INVALID');
          kimiProfile = await prepareManagedKimiProfile({ sessionHome: home, credentialSource: c.kimiCredentialSource });
        }
        const token = bridge.issue(input.handleTool);
        return {
          env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PATH:join(home,'bin'),KIMI_CODE_NO_AUTO_UPDATE:'1',KIMI_DISABLE_TELEMETRY:'1',KIMI_DISABLE_CRON:'1'},
          extraArgs:['--agent-file',kimiProfile.agentPath],
          mcpServers:[{name:'agentrouter-role',command:process.execPath,args:[c.roleBridge],env:[{name:'AGENTROUTER_BRIDGE_ENDPOINT',value:bridge.endpoint},{name:'AGENTROUTER_BRIDGE_TOKEN',value:token}]}],
          kimiConfiguration:{modelConfigId:'model',effortConfigId:'thinking'},session,
          approveKimi:approveManagedKimiRoute,
          revoke:()=>bridge.revoke(token),
          saveSession:async(ref,guard)=>{sessions.save({...scope,key:input.key,isCurrent:guard.isCurrent},ref);},
        };
      }
      // Read the explicitly authorized source only inside the trusted provider, never into child env.
      // 百炼绑定:标签格式凭据 + compatible-mode base;缺省保持 agentrouter-deepseek 原路径。
      const piProviderId = c.piProvider?.providerId ?? 'agentrouter-deepseek';
      const piModelId = c.piProvider?.modelId ?? 'deepseek-v4-flash';
      const piContextWindow = c.piProvider?.contextWindowTokens ?? 65536;
      const piMaxTokens = c.piProvider?.maxOutputTokens ?? 1024;
      let provider: ApprovedProvider;
      if (c.piProvider && c.piCredentialFile) {
        if (!isAbsolute(c.piCredentialFile)) throw Error('PI_CREDENTIAL_PATH_INVALID');
        const cred = parseLabeledCredential(readFileSync(c.piCredentialFile, 'utf8'));
        const u = new URL(cred.baseUrl);
        provider = new ApprovedProvider(
          { origin: u.origin, path: u.pathname + '/chat/completions', models: [piModelId], timeoutMs: 60000 },
          async () => cred.apiKey,
        );
      } else {
        provider = new ApprovedProvider({ ...deepSeekPolicy, timeoutMs: 60000 }, async () => {
          const keys = [
            ...new Set(readFileSync(c.credentialFile, 'utf8').match(/sk-[A-Za-z0-9_-]{16,}/g) ?? []),
          ];
          if (keys.length !== 1) throw Error('CREDENTIAL_FORMAT_UNRECOGNIZED');
          return keys[0];
        });
      }
      const broker = await createPiProviderBroker(provider, piModelId, piMaxTokens);
      const token = bridge.issue(input.handleTool);
      const { capability } = broker; // Generated loopback capability, never the upstream credential.
      const modelPath = join(home, '.pi', 'models.json');
      try {
        writeFileSync(
          modelPath,
          JSON.stringify({
            providers: {
              [piProviderId]: {
                baseUrl: broker.baseUrl,
                api: 'openai-completions',
                apiKey: capability,
                compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
                models: [
                  {
                    id: piModelId,
                    name: piModelId,
                    reasoning: false,
                    input: ['text'],
                    contextWindow: piContextWindow,
                    maxTokens: piMaxTokens,
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
  const drivers = builtInDrivers({ zcodeCli: c.zcodeCli, dshBin: c.dshBin });
  const backend = new NativeProcessBackend(host, 120000, 10000, drivers);
  app.registeredHarnesses = () => drivers.list();
  setAllowedHarnesses(drivers.list());
  for (const harness of new Set(c.profiles.map(p=>p.harness))) registry.attach(harness, {
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
  app.roleSessionTransition = (role, harness, sessionId) =>
    transitionWorkSessionBinding(app, registry, c.profiles, role, harness, sessionId);
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
