import schema from '../protocol/route.schema.json' with { type: 'json' };
const object = (properties) => ({ type: 'object', properties, additionalProperties: false });
export const toolDefinitions = [
  {
    name: 'route_context',
    inputSchema: object({
      section: {
        enum: ['identity', 'roles', 'task', 'child_results', 'policy', 'notices', 'all', 'results'],
      },
      after_cursor: { type: 'integer', minimum: 0 },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
    }),
  },
  {
    name: 'route_send',
    inputSchema: {
      type: 'object',
      $defs: schema.$defs,
      oneOf: [{ $ref: '#/$defs/request' }, { $ref: '#/$defs/notice' }],
    },
  },
  {
    name: 'route_finish',
    inputSchema: { type: 'object', $defs: schema.$defs, ...schema.$defs.finish },
  },
  {
    name: 'route_wait',
    inputSchema: { type: 'object', $defs: schema.$defs, ...schema.$defs.wait },
  },
  {
    name: 'route_artifact_register',
    inputSchema: {
      ...object({
        workspace_id: { $ref: '#/$defs/id' },
        path: { type: 'string', minLength: 1, maxLength: 4096 },
        media_type: { type: 'string', maxLength: 200 },
      }),
      $defs: schema.$defs,
      required: ['workspace_id', 'path'],
    },
  },
  {
    name: 'route_artifact_read',
    inputSchema: {
      ...object({
        reference: { $ref: '#/$defs/reference' },
        offset_bytes: { type: 'integer', minimum: 0 },
        limit_bytes: { type: 'integer', minimum: 1, maximum: 65536 },
      }),
      $defs: schema.$defs,
      required: ['reference'],
    },
  },
].map((tool) => ({
  ...tool,
  description: 'AgentRouter 内部受控工具；成功仅返回必要数据，不产生业务回执。',
}));
