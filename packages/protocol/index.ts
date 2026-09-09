import { Ajv2020 } from 'ajv/dist/2020.js';
import { createHash, randomUUID } from 'node:crypto';
import schema from './route.schema.json' with { type: 'json' };
export type Data = Record<string, any>;
export class RouteError extends Error {
  readonly trace_id = randomUUID();
  constructor(
    readonly code: string,
    readonly category = 'VALIDATION',
    readonly field: string | null = null,
  ) {
    super(code);
  }
  toJSON() {
    return {
      code: this.code,
      category: this.category,
      field: this.field,
      message: this.code,
      suggestion:
        this.category === 'UNAVAILABLE'
          ? '检查存储或环境；不要修改业务措辞重试。'
          : '检查当前身份、任务状态与协议字段。',
      retryable: false,
      trace_id: this.trace_id,
    };
  }
}
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);
export function validatePayload(input: unknown): asserts input is Data {
  const serialized = JSON.stringify(input);
  if (!serialized || Buffer.byteLength(serialized) > 262144)
    throw new RouteError('PACKET_BYTE_LIMIT');
  if (!validate(input))
    throw new RouteError(
      'INVALID_PAYLOAD',
      'VALIDATION',
      validate.errors?.[0]?.instancePath ?? null,
    );
  const check = (obj: Data) => {
    if (typeof obj.body === 'string' && Buffer.byteLength(obj.body) > 65536)
      throw new RouteError('BODY_BYTE_LIMIT');
    if (obj.next_request) check(obj.next_request);
  };
  check(input as Data);
}
export function validatePolicy(input: unknown): void {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new RouteError('INVALID_POLICY');
  const p = input as Data;
  if (
    Object.keys(p).some((k) => k !== 'fields') ||
    !p.fields ||
    typeof p.fields !== 'object' ||
    Array.isArray(p.fields)
  )
    throw new RouteError('UNSAFE_POLICY');
  if (Object.keys(p.fields).length > 64) throw new RouteError('POLICY_LIMIT');
  for (const field of Object.values(p.fields) as Data[]) {
    if (
      !field ||
      typeof field !== 'object' ||
      Array.isArray(field) ||
      Object.keys(field).some((k) => !['type', 'required', 'enum', 'maxLength'].includes(k))
    )
      throw new RouteError('UNSAFE_POLICY');
    if (!['string', 'number', 'boolean'].includes(field.type))
      throw new RouteError('INVALID_POLICY_TYPE');
    if (field.required !== undefined && typeof field.required !== 'boolean')
      throw new RouteError('INVALID_POLICY_REQUIRED');
    if (
      field.maxLength !== undefined &&
      (!Number.isInteger(field.maxLength) || field.maxLength < 1 || field.maxLength > 8192)
    )
      throw new RouteError('INVALID_POLICY_LIMIT');
    if (
      field.enum !== undefined &&
      (!Array.isArray(field.enum) ||
        field.enum.length > 64 ||
        field.enum.some((v: unknown) => typeof v !== field.type))
    )
      throw new RouteError('INVALID_POLICY_ENUM');
  }
}
export function canonical(value: any): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export const digest = (value: unknown) =>
  createHash('sha256').update(canonical(value)).digest('hex');
export const id = (prefix: string) => `${prefix}_${randomUUID()}`;
