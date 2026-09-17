/** WC04:共享 Provider 配置工厂——Windows/Linux 共用一次实现。
 * 输入非秘密(owner 已校验的端点/模型/受管 HOME/桥接入口),输出各 Harness 官方配置形状;
 * 密钥不经过本工厂:由受信宿主按 requires 指示注入(env / 受管 config / 凭据文件)。
 * Linux 按实际路径与版本实例化,不另写一份业务工厂。 */

export interface SharedProfileInput {
  harness: 'pi' | 'deepseek_harness' | 'kimi_code' | 'zcode';
  providerId: string;
  model: string;
  baseURL: string;
  managedHome: string;
  /** Role MCP 桥入口(命令与参数,不含 env 秘密)。 */
  toolBridge?: { command: string; args: string[] };
  /** pi 专用:上下文/输出预算。 */
  contextWindowTokens?: number;
  maxOutputTokens?: number;
}

export type SharedProviderProfile =
  | { harness: 'pi'; configKind: 'pi-broker'; providerId: string; modelId: string; contextWindowTokens: number; maxOutputTokens: number; credential: 'labeled-file' }
  | { harness: 'deepseek_harness'; configKind: 'dsh-env'; providerId: 'balian'; modelId: string; requiresEnv: { name: 'BALIAN_API_KEY' } }
  | {
      harness: 'kimi_code';
      configKind: 'kimi-config-toml';
      providerId: string;
      modelRef: string;
      baseURL: string;
      requires: 'config.toml api_key (kimi 官方存储位置,受管 HOME 0600)';
    }
  | { harness: 'zcode'; configKind: 'zcode-config-json'; providerId: string; modelRef: string; baseURL: string; requiresEnv: { name: 'ZCODE_API_KEY' } };

const BAILIAN_BASE_RE = /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.cn-[a-z]+\.maas\.aliyuncs\.com\/compatible-mode\/v1$/;

export function buildSharedProviderProfile(input: SharedProfileInput): SharedProviderProfile {
  if (!BAILIAN_BASE_RE.test(input.baseURL)) throw Error('SHARED_PROFILE_BASE_URL_INVALID');
  if (input.harness !== 'pi' && input.model !== 'qwen3.8-flash') throw Error('SHARED_PROFILE_MODEL_MISMATCH');
  switch (input.harness) {
    case 'pi':
      return {
        harness: 'pi',
        configKind: 'pi-broker',
        providerId: input.providerId,
        modelId: input.model,
        contextWindowTokens: input.contextWindowTokens ?? 131072,
        maxOutputTokens: input.maxOutputTokens ?? 4096,
        credential: 'labeled-file',
      };
    case 'deepseek_harness':
      // dsh 官方 settings.yaml 内置 balian provider(apiKeyEnv=BALIAN_API_KEY)。
      return { harness: 'deepseek_harness', configKind: 'dsh-env', providerId: 'balian', modelId: input.model, requiresEnv: { name: 'BALIAN_API_KEY' } };
    case 'kimi_code':
      // kimi-code 官方 openai-wire provider(catalog add alibaba-cn 形状);api_key 存受管 config.toml。
      return { harness: 'kimi_code', configKind: 'kimi-config-toml', providerId: input.providerId, modelRef: input.providerId + '/' + input.model, baseURL: input.baseURL, requires: 'config.toml api_key (kimi 官方存储位置,受管 HOME 0600)' };
    case 'zcode':
      // ZCode 官方 openai-compatible provider + ZCODE_API_KEY env。
      return { harness: 'zcode', configKind: 'zcode-config-json', providerId: input.providerId, modelRef: input.providerId + '/' + input.model, baseURL: input.baseURL, requiresEnv: { name: 'ZCODE_API_KEY' } };
  }
}
