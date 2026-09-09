import { Ajv2020 } from 'ajv/dist/2020.js';
import { createHash } from 'node:crypto';
import schema from '../../../contracts/client-api.c1r1.schema.json' with { type: 'json' };
import oldSchema from '../../../contracts/client-api.c1.schema.json' with { type: 'json' };
import planSchema from '../../../contracts/agentrouter-role-plan.v1.schema.json' with { type: 'json' };
import { methodMetadata, type Method, type Request, type Error as WireError } from './generated.ts';
export * from './generated.ts';
const ajv = new Ajv2020({ strict: false, inlineRefs: false });
ajv.addSchema(schema);
ajv.addSchema(oldSchema);
ajv.addSchema(planSchema);
export class C1R1Error extends Error {
  constructor(
    readonly code: WireError['code'],
    readonly category: WireError['category'] = 'VALIDATION',
  ) {
    super(code);
  }
  wire(): WireError {
    return {
      code: this.code,
      category: this.category,
      message_key: 'errors.' + this.code.toLowerCase(),
      retryable: false,
      trace_id: 'trace_mock',
      details: {},
    };
  }
}
export function canonical(x: unknown): string {
  if (x === null || typeof x !== 'object') return JSON.stringify(x);
  if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
  return (
    '{' +
    Object.keys(x)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonical((x as Record<string, unknown>)[k]))
      .join(',') +
    '}'
  );
}
export function digest(x: unknown) {
  return createHash('sha256').update(canonical(x)).digest('hex');
}
export function validateRequest(x: unknown): Request {
  if (
    Buffer.byteLength(JSON.stringify(x)) > 262144 ||
    !ajv.getSchema(schema.$id + '#/$defs/Request')!(x)
  )
    throw new C1R1Error('INVALID_FRAME');
  return x as Request;
}
export function validateDefinition(name: string, x: unknown) {
  if (!ajv.getSchema(schema.$id + '#/$defs/' + name)!(x)) throw new C1R1Error('INVALID_PARAMS');
}
export function validatePlanShape(x: unknown): boolean {
  return !!ajv.validate(planSchema.$id, x);
}
export function validateResponse(method: Method, x: unknown) {
  validateDefinition(methodMetadata[method].result, x);
}
/** C1 为闭合 Schema，协商旧版本后必须删除扩展字段，而不是把新字段直接塞给旧 UI。 */
export function legacyProjection(method: Method, x: any): any {
  const definitions = oldSchema.$defs as Record<string, any>;
  function project(s: any, v: any): any {
    if (v === null || v === undefined) return v;
    if (s.$ref) return project(definitions[s.$ref.split('/').at(-1)], v);
    if (s.anyOf || s.oneOf) {
      const variants = s.anyOf ?? s.oneOf;
      for (const t of variants) {
        try {
          const p = project(t, v);
          if (ajv.validate({ $defs: definitions, ...t }, p)) return p;
        } catch {}
      }
      return v;
    }
    if (s.type === 'object')
      return Object.fromEntries(
        Object.entries(s.properties)
          .filter(([k]) => k in v)
          .map(([k, t]) => [k, project(t, v[k])]),
      );
    if (s.type === 'array') return v.map((i: any) => project(s.items, i));
    return v;
  }
  const m = (oldSchema['x-methods'] as Record<string, any>)[method];
  if (!m) throw new C1R1Error('CAPABILITY_UNAVAILABLE', 'UNAVAILABLE');
  const result = structuredClone(x);
  if (method === 'system.initialize' || method === 'harness.list') {
    const caps = method === 'system.initialize' ? result.capabilities : result;
    caps.methods = caps.methods.filter((n: string) => n in oldSchema['x-methods']);
    if (method === 'system.initialize') {
      result.schemaVersion = 1;
      delete result.contractRevision;
    }
  }
  if (method === 'events.catchup')
    for (const event of result.events)
      if (!oldSchema.$defs.Event.properties.event.enum.includes(event.event))
        event.event = 'project.changed';
  const p = project(definitions[m.result], result);
  if (!ajv.getSchema(oldSchema.$id + '#/$defs/' + m.result)!(p))
    throw new C1R1Error('INTERNAL_ERROR', 'INTERNAL');
  return p;
}
/** 由受信任角色身份调用；不提供 GUI 伪造 Route 身份的方法。 */
export function assertSameSpace(
  roles: readonly { id: string; spaceId: string }[],
  from: string,
  to: string,
) {
  const a = roles.find((r) => r.id === from),
    b = roles.find((r) => r.id === to);
  if (!a || !b || a.spaceId !== b.spaceId)
    throw new C1R1Error('CROSS_SPACE_DENIED', 'AUTHORIZATION');
}
