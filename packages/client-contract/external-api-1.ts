import { Ajv2020 } from 'ajv/dist/2020.js';
/** 可选 external-api/1 扩展；不进入冻结 C1/C1R1/C1R1P1 帧。旧客户端不使用，旧 Core 经冻结 Request 校验拒绝。 */
export const EXTERNAL_API_EXTENSION = 'external-api/1';
export const EXTERNAL_API_METHODS = [
  'externalApi.list',
  'externalApi.describe',
  'externalApi.call',
] as const;
export type ExternalApiMethod = (typeof EXTERNAL_API_METHODS)[number];
/** 扩展方法前缀：external-api/1 与 RoleSession 连续性共用同一帧格式与错误信封。 */
export function isExtensionMethod(method: unknown): boolean {
  return (
    (EXTERNAL_API_METHODS as readonly string[]).includes(method as string) ||
    (typeof method === 'string' &&
      (method.startsWith('roleSession.') ||
        method.startsWith('participant.') ||
        method.startsWith('contract.') ||
        method.startsWith('remoteDevice.')))
  );
}
export function isExternalApiMethod(method: unknown): method is ExternalApiMethod {
  return (EXTERNAL_API_METHODS as readonly string[]).includes(method as string);
}
const IdString = { type: 'string', minLength: 1, maxLength: 160 } as const;
const ajv = new Ajv2020({ strict: true, allErrors: false });
const compile = (schema: unknown) => ajv.compile(schema as object);
const listParams = compile({
  type: 'object',
  additionalProperties: false,
  properties: {},
});
const describeParams = compile({
  type: 'object',
  additionalProperties: false,
  required: ['profile_id', 'action_id'],
  properties: { profile_id: IdString, action_id: IdString },
});
const callParams = compile({
  type: 'object',
  additionalProperties: false,
  required: ['profile_id', 'action_id', 'args', 'request_key'],
  properties: {
    profile_id: IdString,
    action_id: IdString,
    args: { type: 'object' },
    request_key: { type: 'string', pattern: '^[A-Za-z0-9_.:-]{1,128}$' },
    confirm: { type: 'string', pattern: '^[a-f0-9]{64}$' },
  },
});
const listResult = compile({
  type: 'object',
  additionalProperties: false,
  required: ['profiles'],
  properties: {
    profiles: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'displayName', 'actions'],
        properties: {
          id: IdString,
          displayName: { type: 'string', minLength: 1, maxLength: 80 },
          actions: { type: 'array', items: IdString },
        },
      },
    },
  },
});
const describeResult = compile({
  type: 'object',
  additionalProperties: false,
  required: ['profile_id', 'action_id', 'inputSchema', 'sideEffect', 'confirmationRequired'],
  properties: {
    profile_id: IdString,
    action_id: IdString,
    inputSchema: { type: 'object' },
    sideEffect: { enum: ['READ_ONLY', 'WRITE', 'DESTRUCTIVE'] },
    confirmationRequired: { type: 'boolean' },
  },
});
const callResult = compile({
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['state', 'output'],
      properties: { state: { const: 'SUCCEEDED' }, output: {} },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['state'],
      properties: { state: { const: 'UNKNOWN' } },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['state', 'confirmation', 'profile_id', 'action_id', 'sideEffect'],
      properties: {
        state: { const: 'PREVIEW' },
        confirmation: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        profile_id: IdString,
        action_id: IdString,
        sideEffect: { enum: ['READ_ONLY', 'WRITE', 'DESTRUCTIVE'] },
      },
    },
  ],
});
const resultByMethod = {
  'externalApi.list': listResult,
  'externalApi.describe': describeResult,
  'externalApi.call': callResult,
} as const;
const paramsByMethod = {
  'externalApi.list': listParams,
  'externalApi.describe': describeParams,
  'externalApi.call': callParams,
} as const;
export interface ExternalApiFrame {
  v: 1;
  id: string;
  method: ExternalApiMethod;
  params?: Record<string, unknown>;
  client_id?: string;
  lease_id?: string;
  request_key?: string;
  operation_id?: string;
  expected_revision?: number;
  preflight_hash?: string;
}
/** 扩展错误码不进入冻结 ErrorCode 枚举；仅允许保守的大写诊断码，绝不携带上游细节。 */
export function extensionErrorCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code ?? (error as Error)?.message;
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,95}$/.test(code)
    ? code
    : 'EXTERNAL_API_FAILED';
}
export function validateExternalApiFrame(frame: unknown): ExternalApiFrame {
  if (
    !frame ||
    typeof frame !== 'object' ||
    !isExtensionMethod((frame as ExternalApiFrame).method)
  )
    throw Error('INVALID_FRAME');
  const f = frame as ExternalApiFrame;
  if (
    f.v !== 1 ||
    typeof f.id !== 'string' ||
    !f.id ||
    f.id.length > 160 ||
    (f.params !== undefined && (typeof f.params !== 'object' || f.params === null || Array.isArray(f.params))) ||
    (f.client_id !== undefined && (typeof f.client_id !== 'string' || !f.client_id || f.client_id.length > 160)) ||
    (f.lease_id !== undefined && (typeof f.lease_id !== 'string' || !f.lease_id || f.lease_id.length > 160)) ||
    (f.request_key !== undefined && (typeof f.request_key !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(f.request_key))) ||
    (f.operation_id !== undefined && (typeof f.operation_id !== 'string' || !/^[A-Za-z0-9_.:-]{1,160}$/.test(f.operation_id))) ||
    (f.expected_revision !== undefined && (!Number.isSafeInteger(f.expected_revision) || f.expected_revision < 0)) ||
    (f.preflight_hash !== undefined && (typeof f.preflight_hash !== 'string' || !/^[a-f0-9]{64}$/.test(f.preflight_hash)))
  )
    throw Error('INVALID_FRAME');
  if (isExternalApiMethod(f.method)) {
    if (!(paramsByMethod[f.method] as ReturnType<typeof compile>)(f.params ?? {}))
      throw Error('INVALID_PARAMS');
    if (f.method === 'externalApi.call' && (!f.client_id || !f.lease_id))
      throw Error('CONTROL_LEASE_REQUIRED');
  }
  return f;
}
export function validateExtensionResult(method: string, result: unknown): void {
  if (!isExternalApiMethod(method)) return; // roleSession 结果由扩展的服务端schema负责
  if (!(resultByMethod[method] as ReturnType<typeof compile>)(result))
    throw Error('EXTERNAL_API_RESULT_INVALID');
}
/** 扩展回复信封；错误码为保守诊断码，响应丢失按 unknownOutcome 处理。 */
export function extensionReply(id: string, result: unknown): { v: 1; id: string; result: unknown } {
  return { v: 1, id, result };
}
export function extensionErrorReply(id: string, error: unknown) {
  return { v: 1, id, error: { code: extensionErrorCode(error) } };
}
