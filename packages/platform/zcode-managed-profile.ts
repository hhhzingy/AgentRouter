import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

export interface ZcodeModelProviderConfig {
  /** 官方 model ref:"provider/model",如 "zai/glm-4.6";provider 段为内置或 provider 记录的 id。 */
  main: string;
  /** provider 记录:openai-compatible 需 baseURL;全部为非秘密 allowlist 设置。 */
  provider: {
    id: string;
    kind: 'anthropic' | 'openai' | 'openai-compatible';
    baseURL?: string;
    name?: string;
  };
}
export interface ZcodeExistingAccountProviderRuntime {
  builtinProviderConfigFile: string;
  defaultModelSelection: {
    providerId: 'account:bigmodel-individual-coding-plan';
    modelId: 'GLM-5.3-Flash';
  };
}
const KEY_RE = /^[A-Za-z0-9._-]{16,256}$/;

/** 只准备已由 owner 校验的持久 HOME;非秘密模型/Provider 设置由 owner 传入。
 * 不读取/复制桌面认证。官方 oauth DUT 登录会向 provider options 写入 apiKey,
 * 或写 modelProviderFamilySelectedKeys——本准备器保留这些认证增量,只校验自己写入的非秘密键。 */
export function prepareManagedZcodeProfile(
  sessionHome: string,
  model?: ZcodeModelProviderConfig,
  providerRuntime?: ZcodeExistingAccountProviderRuntime,
) {
  if (!isAbsolute(sessionHome)) throw Error('ZCODE_HOME_INVALID');
  const home = realpathSync(sessionHome);
  const inside = (target: string) => {
    const rel = relative(home, realpathSync(target));
    if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel))
      throw Error('ZCODE_CONFIG_OUTSIDE_HOME');
  };
  for (const path of [
    join(home, '.zcode'),
    join(home, '.zcode', 'cli'),
    ...(providerRuntime ? [join(home, '.zcode', 'v2')] : []),
  ]) {
    if (existsSync(path)) inside(path);
    else mkdirSync(path);
  }
  if (model) {
    if (
      !/^[a-z][a-z0-9_-]{1,40}\/[A-Za-z0-9._:-]{1,80}$/.test(model.main) ||
      model.main.split('/')[0] !== model.provider.id ||
      !/^[a-z][a-z0-9_-]{1,40}$/.test(model.provider.id) ||
      !['anthropic', 'openai', 'openai-compatible'].includes(model.provider.kind) ||
      (model.provider.kind === 'openai-compatible' &&
        (!model.provider.baseURL ||
          !/^https:\/\/[A-Za-z0-9._~-]+(:\d{1,5})?(\/[!$&'*+,;=:@A-Za-z0-9._~-]*)*\/v\d+$/.test(
            model.provider.baseURL,
          )))
    )
      throw Error('ZCODE_MODEL_CONFIG_INVALID');
  }
  let providerConfigPath: string | undefined;
  let providerEnv: Record<string, string> | undefined;
  if (providerRuntime) {
    if (
      model ||
      providerRuntime.defaultModelSelection.providerId !==
        'account:bigmodel-individual-coding-plan' ||
      providerRuntime.defaultModelSelection.modelId !== 'GLM-5.3-Flash' ||
      !isAbsolute(providerRuntime.builtinProviderConfigFile) ||
      !existsSync(providerRuntime.builtinProviderConfigFile)
    )
      throw Error('ZCODE_PROVIDER_RUNTIME_CONFIG_INVALID');
    const builtinProviderConfigFile = realpathSync(providerRuntime.builtinProviderConfigFile);
    providerConfigPath = join(home, '.zcode', 'v2', 'provider_config.json');
    const providerConfig = {
      schemaVersion: 1,
      config: {
        providerConfigRules: { providerRules: [] },
        modelConfigRules: { providerModelRules: [], manualProviderModelRules: [] },
        defaultModelSelection: providerRuntime.defaultModelSelection,
      },
    };
    const expected = JSON.stringify(providerConfig, null, 2) + '\n';
    if (existsSync(providerConfigPath)) {
      inside(providerConfigPath);
      let current: unknown;
      try {
        current = JSON.parse(readFileSync(providerConfigPath, 'utf8'));
      } catch {
        throw Error('ZCODE_PROVIDER_CONFIG_UNREADABLE');
      }
      if (JSON.stringify(current) !== JSON.stringify(providerConfig))
        throw Error('ZCODE_PROVIDER_CONFIG_CONFLICT');
    } else {
      writeFileSync(providerConfigPath, expected, { flag: 'wx', mode: 0o600 });
    }
    providerEnv = {
      ZCODE_BUILTIN_PROVIDER_CONFIG_FILE: builtinProviderConfigFile,
      ZCODE_PERSONAL_PROVIDER_CONFIG_FILE: providerConfigPath,
    };
  }
  const configPath = join(home, '.zcode', 'cli', 'config.json');
  const managed: Record<string, unknown> = {
    storage: {
      dir: join(home, '.zcode'),
      sessionDbPath: join(home, '.zcode', 'cli', 'db', 'db.sqlite'),
    },
    plugins: { enabled: false, dirs: [], enabledPlugins: {}, extraKnownMarketplaces: {} },
    hooks: { enabled: false, events: {} },
    mcp: { servers: {} },
  };
  if (model) {
    managed.model = { main: model.main };
    managed.provider = {
      [model.provider.id]: {
        kind: model.provider.kind,
        ...(model.provider.name ? { name: model.provider.name } : {}),
        ...(model.provider.baseURL ? { options: { baseURL: model.provider.baseURL } } : {}),
      },
    };
  }
  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify(managed, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    // 双写旧布局(~/.zcode/config.json):部分 0.16.5 重打包构建从这里读主配置(见下方说明)。
    const legacyNew = join(home, '.zcode', 'config.json');
    if (!existsSync(legacyNew))
      writeFileSync(legacyNew, readFileSync(configPath), { flag: 'wx', mode: 0o600 });
    return {
      configPath,
      home,
      ...(providerConfigPath ? { providerConfigPath, providerEnv } : {}),
    };
  }
  inside(configPath);
  // 已有配置:逐键校验受管非秘密键完全一致;认证键(apiKey/selectedKeys 等)容忍并保留。
  let current: Record<string, unknown>;
  try {
    current = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  } catch {
    throw Error('ZCODE_EXISTING_CONFIG_UNREADABLE');
  }
  for (const [key, want] of Object.entries(managed)) {
    const got = current[key];
    if (key === 'provider') {
      if (typeof got !== 'object' || got === null) throw Error('ZCODE_EXISTING_CONFIG_CONFLICT');
      for (const [pid, pwant] of Object.entries(want as Record<string, unknown>)) {
        const pgot = (got as Record<string, unknown>)[pid];
        if (typeof pgot !== 'object' || pgot === null)
          throw Error('ZCODE_EXISTING_CONFIG_CONFLICT');
        const { apiKey: _omit, ...rest } = pgot as Record<string, unknown>;
        const wOpt = (pwant as Record<string, unknown>).options as
          Record<string, unknown> | undefined;
        const gOpt = (rest.options ?? {}) as Record<string, unknown>;
        const { apiKey: _omit2, ...gOptSafe } = gOpt;
        if (
          JSON.stringify({ ...rest, options: gOptSafe }) !==
          JSON.stringify({ ...(pwant as Record<string, unknown>), options: wOpt ?? {} })
        )
          throw Error('ZCODE_EXISTING_CONFIG_CONFLICT');
      }
      continue;
    }
    if (JSON.stringify(got) !== JSON.stringify(want)) throw Error('ZCODE_EXISTING_CONFIG_CONFLICT');
  }
  // 0.16.5 同版本重打包后,部分构建从 ~/.zcode/config.json 读主配置(而非 ~/.zcode/cli/)。
  // 双写同一受管内容:旧布局/新布局各自命中;认证增量仍只出现在 ~/.zcode/cli/ 一侧并原样保留。
  const legacyPath = join(home, '.zcode', 'config.json');
  if (!existsSync(legacyPath))
    writeFileSync(legacyPath, readFileSync(configPath), { flag: 'wx', mode: 0o600 });
  return {
    configPath,
    home,
    ...(providerConfigPath ? { providerConfigPath, providerEnv } : {}),
  };
}
export { KEY_RE as zcodeApiKeyPattern };
