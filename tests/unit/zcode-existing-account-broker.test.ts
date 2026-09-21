import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  createZcodeExistingAccountHost,
  type ZcodeExistingAccountBrokerConfig,
} from '../../packages/platform/zcode-existing-account-broker.ts';

const providerId = 'account:bigmodel-individual-coding-plan';
const modelId = 'GLM-5.3-Flash';
const canary = 'synthetic-secret-canary-0123456789';

function encrypt(value: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), iv);
  const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `enc:v1:${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${bytes.toString('base64url')}`;
}

function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'agentrouter-zcode-broker-'));
  const builtin = join(base, 'zcode-builtin.json');
  writeFileSync(
    builtin,
    JSON.stringify({
      schemaVersion: 1,
      revision: 30,
      config: {
        providerConfigRules: {
          providerRules: [
            {
              providerId,
              config: {
                builtinModelIds: [modelId],
                access: {
                  type: 'zhipu-account',
                  accountType: 'bigmodel',
                  mode: 'individual-coding-plan',
                },
              },
            },
          ],
        },
        modelConfigRules: {
          builtinProviderModelRules: [
            { providerId, modelId, config: { enabled: true } },
          ],
        },
      },
    }),
  );
  const credentials = join(base, '.zcode', 'v2', 'credentials.json');
  mkdirSync(join(base, '.zcode', 'v2'), { recursive: true });
  const key = `account-provider:coding-plan:${encodeURIComponent(providerId)}:account:${encodeURIComponent('user@example.test')}:api-key`;
  const config: ZcodeExistingAccountBrokerConfig = {
    mode: 'EXISTING_ACCOUNT',
    dataBaseDir: base,
    builtinProviderConfigFile: builtin,
    expectedAccountType: 'bigmodel',
    expectedMode: 'individual-coding-plan',
    expectedProviderId: providerId,
    expectedModelId: modelId,
    upstreamVersion: '0.16.9',
    upstreamSourceSha: '872ad960de7ec172591f7e1952f7849229f94521',
    allowCredentialMutation: false,
    allowCredentialCopy: false,
  };
  return { base, builtin, config, credentials, key };
}

function validRequest() {
  return {
    requestId: 'request-1',
    sessionId: 'session-1',
    workspace: { workspacePath: 'C:\\work', workspaceKey: 'C:\\work' },
    modelSelection: { providerId, modelId },
    providerId,
    accountAccess: {
      type: 'zhipu-account',
      accountType: 'bigmodel',
      mode: 'individual-coding-plan',
      entitled: true,
    },
    reason: 'model-request',
  };
}

it('reads exactly one encrypted individual-plan key without mutating the store', async () => {
  const f = fixture();
  writeFileSync(f.credentials, JSON.stringify({ [f.key]: encrypt(canary, 'fixture-secret') }));
  const before = readFileSync(f.credentials);
  const host = createZcodeExistingAccountHost(f.config, {
    env: { ZCODE_CREDENTIAL_SECRET: 'fixture-secret' },
  });
  expect(() => host.overlay).toThrow('ZCODE_EXISTING_ACCOUNT_PROBE_REQUIRED');
  const probe = host.probe();
  expect(probe).toMatchObject({
    providerId,
    modelId,
    credentialAvailable: true,
  });
  expect(JSON.stringify(probe)).not.toContain(canary);
  expect(host.overlay.providers).toEqual({
    [providerId]: {
      builtinModelIds: [modelId],
      access: { type: 'zhipu-account', entitled: true },
    },
  });
  const controller = new AbortController();
  await expect(
    host.resolveRuntimeHeaders(validRequest(), {
      sessionId: 'session-1',
      workspacePath: 'C:\\work',
      workspaceKey: 'C:\\work',
      signal: controller.signal,
    }),
  ).resolves.toEqual({ headersApplied: true, requestAuth: { apiKey: canary } });
  expect(readFileSync(f.credentials)).toEqual(before);
  host.close();
});

it('matches the official fallback cipher derivation when no explicit secret exists', async () => {
  const f = fixture();
  const fallback = 'zcode-credential-fallback:win32:C:\\Users\\fixture:fixture-user';
  const shippedKey = f.key.replace(encodeURIComponent(providerId), providerId);
  writeFileSync(f.credentials, JSON.stringify({ [shippedKey]: encrypt(canary, fallback) }));
  const host = createZcodeExistingAccountHost(f.config, {
    env: {},
    platform: () => 'win32',
    homedir: () => 'C:\\Users\\fixture',
    username: () => 'fixture-user',
  });
  host.probe();
  const controller = new AbortController();
  await expect(
    host.resolveRuntimeHeaders(validRequest(), {
      sessionId: 'session-1',
      workspacePath: 'C:\\work',
      workspaceKey: 'C:\\work',
      signal: controller.signal,
    }),
  ).resolves.toMatchObject({ headersApplied: true });
});

it('fails closed for missing, conflicting, corrupt, or locked credentials', () => {
  const missing = fixture();
  writeFileSync(missing.credentials, '{}');
  expect(() => createZcodeExistingAccountHost(missing.config).probe()).toThrow(
    'ZCODE_EXISTING_ACCOUNT_REFRESH_REQUIRED',
  );

  const conflicting = fixture();
  const key2 = conflicting.key.replace('user%40example.test', 'other%40example.test');
  writeFileSync(
    conflicting.credentials,
    JSON.stringify({ [conflicting.key]: 'one', [key2]: 'two' }),
  );
  expect(() => createZcodeExistingAccountHost(conflicting.config).probe()).toThrow(
    'ZCODE_EXISTING_ACCOUNT_IDENTITY_CONFLICT',
  );

  const corrupt = fixture();
  writeFileSync(corrupt.credentials, '{');
  expect(() => createZcodeExistingAccountHost(corrupt.config).probe()).toThrow(
    'ZCODE_EXISTING_ACCOUNT_STORE_CORRUPT',
  );

  const locked = fixture();
  writeFileSync(locked.credentials, JSON.stringify({ [locked.key]: encrypt(canary, 'winner') }));
  const host = createZcodeExistingAccountHost(locked.config, {
    env: { ZCODE_CREDENTIAL_SECRET: 'loser' },
  });
  host.probe();
  const controller = new AbortController();
  return expect(
    host.resolveRuntimeHeaders(validRequest(), {
      sessionId: 'session-1',
      workspacePath: 'C:\\work',
      workspaceKey: 'C:\\work',
      signal: controller.signal,
    }),
  ).rejects.toThrow('ZCODE_EXISTING_ACCOUNT_CREDENTIAL_LOCKED');
});

it('rejects builtin provider/model drift and untrusted broker config', () => {
  const f = fixture();
  const builtin = JSON.parse(readFileSync(f.builtin, 'utf8'));
  builtin.config.providerConfigRules.providerRules[0].config.access.mode = 'team-coding-plan';
  writeFileSync(f.builtin, JSON.stringify(builtin));
  expect(() => createZcodeExistingAccountHost(f.config)).toThrow(
    'ZCODE_EXISTING_ACCOUNT_BUILTIN_MISMATCH',
  );
  expect(() =>
    createZcodeExistingAccountHost({
      ...f.config,
      allowCredentialCopy: true as never,
    }),
  ).toThrow('ZCODE_EXISTING_ACCOUNT_CONFIG_INVALID');
});

it('rejects mismatched or cancelled runtime-auth requests before returning a secret', async () => {
  const f = fixture();
  writeFileSync(f.credentials, JSON.stringify({ [f.key]: canary }));
  const host = createZcodeExistingAccountHost(f.config);
  host.probe();
  const active = new AbortController();
  await expect(
    host.resolveRuntimeHeaders(
      { ...validRequest(), modelSelection: { providerId, modelId: 'wrong' } },
      {
        sessionId: 'session-1',
        workspacePath: 'C:\\work',
        workspaceKey: 'C:\\work',
        signal: active.signal,
      },
    ),
  ).rejects.toThrow('ZCODE_EXISTING_ACCOUNT_REQUEST_MISMATCH');
  const cancelled = new AbortController();
  cancelled.abort();
  await expect(
    host.resolveRuntimeHeaders(validRequest(), {
      sessionId: 'session-1',
      workspacePath: 'C:\\work',
      workspaceKey: 'C:\\work',
      signal: cancelled.signal,
    }),
  ).rejects.toThrow('ZCODE_EXISTING_ACCOUNT_REQUEST_CANCELLED');
  expect(JSON.stringify(host.overlay)).not.toContain(canary);
});
