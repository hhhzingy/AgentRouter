import { Ajv2020 } from 'ajv/dist/2020.js';
import schema from '../../../contracts/client-api.c1r1p1.schema.json' with { type: 'json' };
import r1 from '../../../contracts/client-api.c1r1.schema.json' with { type: 'json' };
import c1 from '../../../contracts/client-api.c1.schema.json' with { type: 'json' };
import { methodMetadata, type Method, type Request } from './generated.ts';
import { C1R1Error } from '../c1r1/index.ts';
export { C1R1Error, canonical, digest, assertSameSpace, validatePlanShape } from '../c1r1/index.ts';
export * from './generated.ts';
export type RevisionName = 'C1' | 'C1R1' | 'C1R1P1';
const ajv = new Ajv2020({ strict: false, inlineRefs: false });
for (const s of [schema, r1, c1]) ajv.addSchema(s);
export function validateDefinition(name: string, x: unknown, revision: RevisionName = 'C1R1P1') {
  const source = revision === 'C1' ? c1 : revision === 'C1R1' ? r1 : schema;
  if (!ajv.getSchema(source.$id + '#/$defs/' + name)?.(x)) throw new C1R1Error('INVALID_FRAME');
}
export function validateRequest(x: unknown): Request {
  if (Buffer.byteLength(JSON.stringify(x)) > 262144) throw new C1R1Error('INVALID_FRAME');
  validateDefinition('Request', x);
  return x as Request;
}
export function validateFrame(x: unknown, revision: RevisionName = 'C1R1P1') {
  const s = revision === 'C1' ? c1 : revision === 'C1R1' ? r1 : schema;
  if (!ajv.getSchema(s.$id)?.(x)) throw new C1R1Error('INVALID_FRAME');
}
export function validateResponse(method: Method, x: unknown, revision: RevisionName = 'C1R1P1') {
  validateDefinition(methodMetadata[method].result, x, revision);
}
export function projectResult(revision: RevisionName, method: Method, x: unknown): unknown {
  if (revision === 'C1R1P1') {
    validateResponse(method, x);
    return x;
  }
  const source = revision === 'C1' ? c1 : r1;
  if (!(method in source['x-methods']))
    throw new C1R1Error('CAPABILITY_UNAVAILABLE', 'UNAVAILABLE');
  if (
    method === 'provider.listProfiles' &&
    (x as { items: { mock: boolean }[] }).items.some((p) => !p.mock)
  )
    throw new C1R1Error('CAPABILITY_UNAVAILABLE', 'UNAVAILABLE');
  const defs: Record<string, any> = source.$defs;
  function project(s: any, v: any): any {
    if (v == null) return v;
    if (s.$ref) return project(defs[s.$ref.split('/').at(-1)], v);
    if (s.anyOf || s.oneOf) {
      for (const t of s.anyOf ?? s.oneOf) {
        try {
          const value = project(t, v);
          if (ajv.validate({ $defs: defs, ...t }, value)) return value;
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
  const result = structuredClone(x) as any;
  if (method === 'system.initialize' || method === 'harness.list') {
    const caps = method === 'system.initialize' ? result.capabilities : result;
    caps.methods = caps.methods.filter((n: string) => n in source['x-methods']);
    if (method === 'system.initialize') {
      result.schemaVersion = revision === 'C1' ? 1 : 2;
      result.contractRevision = revision;
    }
  }
  const value = project(defs[methodMetadata[method].result], result);
  validateResponse(method, value, revision);
  return value;
}
