import { Ajv2020 } from 'ajv/dist/2020.js';
import contract from '../../contracts/client-api.c1r1p1.schema.json' with { type: 'json' };
import { methodMetadata, type Method } from '../client-contract/c1r1p1/index.ts';
export function managementInputSchema(name: string, method: Method) {
  const defs = contract.$defs as Record<string, any>,
    selected: Record<string, any> = {};
  function visit(value: any) {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) {
      const key = value.$ref.split('/').at(-1);
      if (!selected[key]) {
        selected[key] = defs[key];
        visit(defs[key]);
      }
    }
    for (const child of Object.values(value)) visit(child);
  }
  const params = structuredClone(defs[methodMetadata[method].params]);
  if (name === 'router_control_release') {
    params.properties = {};
    params.required = [];
  }
  if (name === 'router_wait')
    params.properties.wait_ms = { type: 'integer', minimum: 0, maximum: 30000 };
  visit(params);
  visit({ $ref: '#/$defs/Scope' });
  return {
    type: 'object' as const,
    properties: {
      params,
      request_key: { type: 'string', pattern: '^[A-Za-z0-9_.:-]{1,128}$' },
      expected_revision: { type: 'integer', minimum: 0 },
      scope: { $ref: '#/$defs/Scope' },
    },
    ...(methodMetadata[method].mutation
      ? { required: ['request_key', 'expected_revision', 'scope'] }
      : { required: [] }),
    additionalProperties: false,
    $defs: selected,
  };
}

const ajv = new Ajv2020({ strict: false });
const validators = new Map<string, ReturnType<typeof ajv.compile>>();
export function validateManagementInput(name: string, method: Method, input: unknown) {
  if (Buffer.byteLength(JSON.stringify(input)) > 262144) throw Error('INVALID_INPUT');
  let check = validators.get(name);
  if (!check) {
    check = ajv.compile(managementInputSchema(name, method));
    validators.set(name, check);
  }
  if (!check(input)) throw Error('INVALID_INPUT');
}
