import { createDecipheriv, createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { homedir, platform, userInfo } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

export const ZCODE_EXISTING_ACCOUNT = Object.freeze({
  mode: 'EXISTING_ACCOUNT',
  accountType: 'bigmodel',
  accountMode: 'individual-coding-plan',
  providerId: 'account:bigmodel-individual-coding-plan',
  modelId: 'GLM-5.3-Flash',
  upstreamVersion: '0.16.9',
  upstreamSourceSha: '872ad960de7ec172591f7e1952f7849229f94521',
});

export interface ZcodeExistingAccountBrokerConfig {
  mode: 'EXISTING_ACCOUNT';
  dataBaseDir: string;
  builtinProviderConfigFile: string;
  expectedAccountType: 'bigmodel';
  expectedMode: 'individual-coding-plan';
  expectedProviderId: 'account:bigmodel-individual-coding-plan';
  expectedModelId: 'GLM-5.3-Flash';
  upstreamVersion: '0.16.9';
  upstreamSourceSha: '872ad960de7ec172591f7e1952f7849229f94521';
  allowCredentialMutation?: false;
  allowCredentialCopy?: false;
}

export interface ZcodeProviderRuntimeHeadersRequest {
  requestId: string;
  sessionId: string;
  turnId?: string;
  workspace: { workspacePath: string; workspaceKey: string };
  modelSelection: { providerId: string; modelId: string };
  providerId: string;
  accountAccess?: {
    type: string;
    accountType: string;
    mode: string;
    entitled: boolean;
  };
  reason: string;
}

export interface ZcodeExistingAccountProbe {
  providerId: string;
  modelId: string;
  accountIdentityHash: string;
  credentialAvailable: true;
  credentialFileSha256: string;
  builtinFileSha256: string;
  basedOnZCodeBuiltinRevision: string;
}

export interface ZcodeExistingAccountHost {
  readonly overlay: {
    revision: string;
    basedOnZCodeBuiltinRevision: string;
    providers: Record<string, unknown>;
    states: Record<string, unknown>;
  };
  probe(): ZcodeExistingAccountProbe;
  resolveRuntimeHeaders(
    request: ZcodeProviderRuntimeHeadersRequest,
    expected: {
      sessionId: string;
      workspacePath: string;
      workspaceKey: string;
      signal: AbortSignal;
    },
  ): Promise<{ headersApplied: true; requestAuth: { apiKey: string } }>;
  close(): void;
}

interface Dependencies {
  env?: Record<string, string | undefined>;
  homedir?: () => string;
  platform?: () => NodeJS.Platform;
  username?: () => string;
}

const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');

function stableError(code: string): Error {
  return Error(code);
}

function assertTrustedConfig(config: ZcodeExistingAccountBrokerConfig): void {
  if (
    config.mode !== ZCODE_EXISTING_ACCOUNT.mode ||
    config.expectedAccountType !== ZCODE_EXISTING_ACCOUNT.accountType ||
    config.expectedMode !== ZCODE_EXISTING_ACCOUNT.accountMode ||
    config.expectedProviderId !== ZCODE_EXISTING_ACCOUNT.providerId ||
    config.expectedModelId !== ZCODE_EXISTING_ACCOUNT.modelId ||
    config.upstreamVersion !== ZCODE_EXISTING_ACCOUNT.upstreamVersion ||
    config.upstreamSourceSha !== ZCODE_EXISTING_ACCOUNT.upstreamSourceSha ||
    (config as unknown as Record<string, unknown>).allowCredentialMutation === true ||
    (config as unknown as Record<string, unknown>).allowCredentialCopy === true ||
    !isAbsolute(config.dataBaseDir) ||
    !isAbsolute(config.builtinProviderConfigFile)
  )
    throw stableError('ZCODE_EXISTING_ACCOUNT_CONFIG_INVALID');
}

function readRecord(bytes: Buffer): Record<string, string> {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw stableError('ZCODE_EXISTING_ACCOUNT_STORE_CORRUPT');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw stableError('ZCODE_EXISTING_ACCOUNT_STORE_CORRUPT');
  const record: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') throw stableError('ZCODE_EXISTING_ACCOUNT_STORE_CORRUPT');
    record[key] = entry;
  }
  return record;
}

function resolveTarget(
  record: Record<string, string>,
  providerId: string,
): { accountIdentity: string; encrypted: string } {
  const prefixes = [
    `account-provider:coding-plan:${encodeURIComponent(providerId)}:account:`,
    `account-provider:coding-plan:${providerId}:account:`,
  ];
  const suffix = ':api-key';
  const matches = Object.entries(record)
    .map(([key, encrypted]) => ({
      key,
      encrypted,
      prefix: prefixes.find((candidate) => key.startsWith(candidate)),
    }))
    .filter(
      (entry): entry is { key: string; encrypted: string; prefix: string } =>
        entry.prefix !== undefined && entry.key.endsWith(suffix),
    );
  if (matches.length === 0) throw stableError('ZCODE_EXISTING_ACCOUNT_REFRESH_REQUIRED');
  if (matches.length !== 1) throw stableError('ZCODE_EXISTING_ACCOUNT_IDENTITY_CONFLICT');
  const { key, encrypted, prefix } = matches[0]!;
  const encodedIdentity = key.slice(prefix.length, -suffix.length);
  let accountIdentity: string;
  try {
    accountIdentity = decodeURIComponent(encodedIdentity);
  } catch {
    throw stableError('ZCODE_EXISTING_ACCOUNT_STORE_CORRUPT');
  }
  if (
    !accountIdentity.trim() ||
    encodeURIComponent(accountIdentity) !== encodedIdentity ||
    !encrypted
  )
    throw stableError('ZCODE_EXISTING_ACCOUNT_STORE_CORRUPT');
  return { accountIdentity, encrypted };
}

function readBuiltin(config: ZcodeExistingAccountBrokerConfig) {
  let bytes: Buffer;
  let value: any;
  try {
    bytes = readFileSync(realpathSync(config.builtinProviderConfigFile));
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw stableError('ZCODE_EXISTING_ACCOUNT_BUILTIN_INVALID');
  }
  const revision = value?.revision;
  const providerRules = value?.config?.providerConfigRules?.providerRules;
  const modelRules = value?.config?.modelConfigRules?.builtinProviderModelRules;
  const provider = Array.isArray(providerRules)
    ? providerRules.filter((entry: any) => entry?.providerId === config.expectedProviderId)
    : [];
  const models = Array.isArray(modelRules)
    ? modelRules.filter(
        (entry: any) =>
          entry?.providerId === config.expectedProviderId &&
          entry?.modelId === config.expectedModelId &&
          entry?.config?.enabled === true,
      )
    : [];
  const p = provider[0]?.config;
  if (
    value?.schemaVersion !== 1 ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    provider.length !== 1 ||
    models.length !== 1 ||
    p?.access?.type !== 'zhipu-account' ||
    p?.access?.accountType !== config.expectedAccountType ||
    p?.access?.mode !== config.expectedMode ||
    !Array.isArray(p?.builtinModelIds) ||
    !p.builtinModelIds.includes(config.expectedModelId)
  )
    throw stableError('ZCODE_EXISTING_ACCOUNT_BUILTIN_MISMATCH');
  const activePath = resolve(realpathSync(config.builtinProviderConfigFile));
  return {
    contentSha256: sha256(bytes),
    revision: `zcode-builtin:${revision}:${sha256(activePath)}`,
  };
}

function cipherSecret(dependencies: Dependencies): string {
  const env = dependencies.env ?? process.env;
  const configured = env.ZCODE_CREDENTIAL_SECRET?.trim();
  if (configured) return configured;
  let username = 'unknown';
  try {
    username = dependencies.username?.() ?? userInfo().username;
  } catch {
    // Keep upstream's documented fallback.
  }
  return `zcode-credential-fallback:${dependencies.platform?.() ?? platform()}:${
    dependencies.homedir?.() ?? homedir()
  }:${username}`;
}

function decrypt(encrypted: string, dependencies: Dependencies): string {
  if (!encrypted.startsWith('enc:v1:')) return encrypted;
  const parts = encrypted.slice('enc:v1:'.length).split('.');
  if (parts.length !== 3 || parts.some((part) => !part))
    throw stableError('ZCODE_EXISTING_ACCOUNT_CREDENTIAL_LOCKED');
  const [ivRaw, tagRaw, cipherRaw] = parts as [string, string, string];
  const iv = Buffer.from(ivRaw, 'base64url');
  const tag = Buffer.from(tagRaw, 'base64url');
  if (iv.length !== 12 || tag.length !== 16)
    throw stableError('ZCODE_EXISTING_ACCOUNT_CREDENTIAL_LOCKED');
  try {
    const key = createHash('sha256').update(cipherSecret(dependencies)).digest();
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(cipherRaw, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw stableError('ZCODE_EXISTING_ACCOUNT_CREDENTIAL_LOCKED');
  }
}

function validateRequest(
  request: ZcodeProviderRuntimeHeadersRequest,
  expected: { sessionId: string; workspacePath: string; workspaceKey: string },
): void {
  if (
    !request ||
    typeof request.requestId !== 'string' ||
    !request.requestId ||
    request.sessionId !== expected.sessionId ||
    request.workspace?.workspacePath !== expected.workspacePath ||
    request.workspace?.workspaceKey !== expected.workspaceKey ||
    request.providerId !== ZCODE_EXISTING_ACCOUNT.providerId ||
    request.modelSelection?.providerId !== ZCODE_EXISTING_ACCOUNT.providerId ||
    request.modelSelection?.modelId !== ZCODE_EXISTING_ACCOUNT.modelId ||
    request.accountAccess?.type !== 'zhipu-account' ||
    request.accountAccess?.accountType !== ZCODE_EXISTING_ACCOUNT.accountType ||
    request.accountAccess?.mode !== ZCODE_EXISTING_ACCOUNT.accountMode ||
    request.accountAccess?.entitled !== true ||
    request.reason !== 'model-request'
  )
    throw stableError('ZCODE_EXISTING_ACCOUNT_REQUEST_MISMATCH');
}

export function createZcodeExistingAccountHost(
  config: ZcodeExistingAccountBrokerConfig,
  dependencies: Dependencies = {},
): ZcodeExistingAccountHost {
  assertTrustedConfig(config);
  const builtin = readBuiltin(config);
  const credentialPath = join(realpathSync(config.dataBaseDir), '.zcode', 'v2', 'credentials.json');
  let closed = false;
  let prepared:
    | { accountIdentityHash: string; credentialFileSha256: string; overlayRevision: string }
    | undefined;
  const inspect = () => {
    if (closed) throw stableError('ZCODE_EXISTING_ACCOUNT_BROKER_CLOSED');
    let bytes: Buffer;
    try {
      bytes = readFileSync(credentialPath);
    } catch {
      throw stableError('ZCODE_EXISTING_ACCOUNT_REFRESH_REQUIRED');
    }
    const target = resolveTarget(readRecord(bytes), config.expectedProviderId);
    return { bytes, target };
  };
  return {
    get overlay() {
      if (!prepared) throw stableError('ZCODE_EXISTING_ACCOUNT_PROBE_REQUIRED');
      return {
        revision: prepared.overlayRevision,
        basedOnZCodeBuiltinRevision: builtin.revision,
        providers: {
          [config.expectedProviderId]: {
            builtinModelIds: [config.expectedModelId],
            access: { type: 'zhipu-account', entitled: true },
          },
        },
        states: {
          [config.expectedProviderId]: {
            availability: 'available',
            entitled: true,
            current: true,
          },
        },
      };
    },
    probe() {
      const before = inspect();
      const after = readFileSync(credentialPath);
      if (sha256(before.bytes) !== sha256(after))
        throw stableError('ZCODE_EXISTING_ACCOUNT_STORE_CHANGED');
      const accountIdentityHash = sha256(before.target.accountIdentity);
      const credentialFileSha256 = sha256(before.bytes);
      prepared = {
        accountIdentityHash,
        credentialFileSha256,
        overlayRevision: `agentrouter-existing-account:${sha256(
          [
            builtin.revision,
            config.expectedProviderId,
            config.expectedModelId,
            accountIdentityHash,
          ].join('\n'),
        )}`,
      };
      return {
        providerId: config.expectedProviderId,
        modelId: config.expectedModelId,
        accountIdentityHash,
        credentialAvailable: true,
        credentialFileSha256,
        builtinFileSha256: builtin.contentSha256,
        basedOnZCodeBuiltinRevision: builtin.revision,
      };
    },
    async resolveRuntimeHeaders(request, expected) {
      if (!prepared) throw stableError('ZCODE_EXISTING_ACCOUNT_PROBE_REQUIRED');
      validateRequest(request, expected);
      if (expected.signal.aborted) throw stableError('ZCODE_EXISTING_ACCOUNT_REQUEST_CANCELLED');
      const before = inspect();
      const apiKey = decrypt(before.target.encrypted, dependencies).trim();
      if (!apiKey) throw stableError('ZCODE_EXISTING_ACCOUNT_REFRESH_REQUIRED');
      if (expected.signal.aborted) throw stableError('ZCODE_EXISTING_ACCOUNT_REQUEST_CANCELLED');
      const after = readFileSync(credentialPath);
      if (sha256(before.bytes) !== sha256(after))
        throw stableError('ZCODE_EXISTING_ACCOUNT_STORE_CHANGED');
      return { headersApplied: true, requestAuth: { apiKey } };
    },
    close() {
      closed = true;
    },
  };
}
