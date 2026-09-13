import { Ajv2020 } from 'ajv/dist/2020.js';
import contractP1 from '../../contracts/client-api.c1r1p1.schema.json' with { type: 'json' };
import planSchemaV1 from '../../contracts/agentrouter-role-plan.v1.schema.json' with { type: 'json' };
import { randomUUID } from 'node:crypto';
/** C1R1P2(草案,CCR-J3-DRIVER-01):在冻结 schema 的内存副本上做唯一放宽——
 * harness 枚举(codex/kimi_code/pi)开放为 HarnessId 模式串;合法集合由服务端
 * HarnessDriverRegistry 运行时判定。冻结文件本身字节不变。 */
export const C1R1P2_REVISION = 'C1R1P2';
const HARNESS_ID_PATTERN = '^[a-z][a-z0-9_]{1,40}$';
function widen(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(widen);
  if (node === null || typeof node !== 'object') return node;
  const obj = node as Record<string, unknown>;
  const e = obj.enum;
  if (
    Array.isArray(e) &&
    e.includes('codex') &&
    e.includes('kimi_code') &&
    e.includes('pi') &&
    e.length === 3
  ) {
    const clone = { ...obj };
    delete clone.enum;
    clone.type = 'string';
    clone.pattern = HARNESS_ID_PATTERN;
    return clone;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = widen(v);
  return out;
}
let cached: {
  validateRequest: (x: unknown) => boolean;
  validateDefinition: (name: string, x: unknown) => boolean;
} | null = null;
function build() {
  if (cached) return cached;
  const widened = widen(JSON.parse(JSON.stringify(contractP1))) as typeof contractP1;
  const ajv = new Ajv2020({ strict: false, inlineRefs: false });
  ajv.addSchema(widened);
  cached = {
    validateRequest: (x) => !!ajv.getSchema(widened.$id + '#/$defs/Request')?.(x),
    validateDefinition: (name, x) =>
      !!ajv.getSchema(widened.$id + '#/$defs/' + name)?.(x),
  };
  return cached;
}
/** P2 连接的请求帧校验:结构与 C1R1P1 完全一致,仅 harness 枚举开放。返回原帧。 */
export function validateRequestP2<T>(x: T): T {
  const size = typeof x === 'object' && x !== null ? Buffer.byteLength(JSON.stringify(x)) : 0;
  if (size > 262144) throw Error('INVALID_FRAME');
  if (!build().validateRequest(x)) throw Error('INVALID_FRAME');
  return x;
}
export function validateDefinitionP2(name: string, x: unknown): void {
  if (!build().validateDefinition(name, x)) throw Error('INVALID_FRAME');
}
let planShapeP2: ((x: unknown) => boolean) | null = null;
/** C1R1P2 的 plan 形状校验:role-plan v1 schema 的内存副本上放宽 harness 枚举。 */
export function validatePlanShapeP2(x: unknown): boolean {
  if (!planShapeP2) {
    const widened = widen(JSON.parse(JSON.stringify(planSchemaV1))) as typeof planSchemaV1;
    const ajv2 = new Ajv2020({ strict: false, inlineRefs: false });
    ajv2.addSchema(widened);
    planShapeP2 = (x) => !!ajv2.getSchema(widened.$id)?.(x);
  }
  return planShapeP2(x);
}
export function newOperationId(): string {
  return 'p2_' + randomUUID();
}
