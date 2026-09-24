import { Ajv2020 } from 'ajv/dist/2020.js';
import schema from '../../contracts/client-api.c1.schema.json' with { type: 'json' };
import {
  methodMetadata,
  type Method,
  type Request,
  type Error as ClientError,
} from './generated.ts';
export * from './generated.ts';
const ajv = new Ajv2020({ strict: false, allErrors: false });
ajv.addSchema(schema);
const frame = ajv.getSchema(schema.$id)!;
export function validateFrame(value: unknown): void {
  if (!frame(value)) throw new ContractError('INVALID_FRAME', 'VALIDATION');
}
export function validateResult(method: Method, value: unknown): void {
  if (!ajv.validate({ $ref: schema.$id + '#/$defs/' + methodMetadata[method].result }, value))
    throw new ContractError('INVALID_FRAME', 'INTERNAL');
}
export class ContractError extends globalThis.Error {
  constructor(
    readonly code: ClientError['code'],
    readonly category: ClientError['category'],
    readonly details: ClientError['details'] = {},
  ) {
    super(code);
  }
  wire(trace: string): ClientError {
    return {
      code: this.code,
      category: this.category,
      message_key: 'errors.' + this.code.toLowerCase(),
      retryable: false,
      trace_id: trace,
      details: this.details,
    };
  }
}
export function asRequest(value: unknown): Request {
  validateFrame(value);
  if (!value || typeof value !== 'object' || !('method' in value))
    throw new ContractError('INVALID_FRAME', 'VALIDATION');
  return value as Request;
}
