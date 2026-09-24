import schema from '../protocol/route.schema.json' with { type: 'json' };
const object = (properties) => ({ type: 'object', properties, additionalProperties: false });
const descriptions = {
  route_context:
    '读取当前受管 Role 的身份、任务、输入和可见结果；只读，不完成任务。Read current managed Role context; read-only and never completes the task.',
  route_send:
    '按任务合同向另一个 Role 发送请求或通知；发送成功不完成当前任务。Send a routed request or notice; success does not complete the current task.',
  route_finish:
    '当前任务的必需终态提交。必填 outcome（不是 status）、summary、body、outputs；例如 {"outcome":"succeeded","summary":"已完成","body":"结果说明","outputs":[{"kind":"artifact","artifact_id":"artifact_..."}]}。完成 Artifact 操作后调用；成功后停止。Required terminal submission. Required keys: outcome (not status), summary, body, outputs. Copy artifact reference from route_artifact_write into outputs. Call after all work, then stop.',
  route_wait:
    '等待已路由子任务或输入，不完成当前任务。Wait for routed work or input; this never completes the current task.',
  route_artifact_write:
    '写入或幂等复用 Workspace Artifact。成功不完成任务；随后必须用 route_finish 提交结果，并按任务要求把 response.reference 原样放入 outputs。Write or idempotently reuse an Artifact. Success does not complete the task; then call route_finish and copy response.reference into outputs when requested.',
  route_artifact_register:
    '登记已存在的 Workspace 文件为 Artifact。成功不完成任务；随后必须用 route_finish 提交结果，并按任务要求把 response.reference 原样放入 outputs。Register an existing file as an Artifact. Success does not complete the task; then call route_finish and copy response.reference into outputs when requested.',
  route_artifact_read:
    '读取已授权 Artifact 的一个分块。只读且不完成任务；处理完成后仍须用 route_finish 提交结果。Read an authorized Artifact chunk; read-only and never completes the task. Call route_finish after processing.',
};
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
    name: 'route_artifact_write',
    inputSchema: {
      ...object({
        workspace_id: { $ref: '#/$defs/id' },
        name: { type: 'string', minLength: 1, maxLength: 96 },
        content: { type: 'string', minLength: 1, maxLength: 262144 },
        media_type: { type: 'string', maxLength: 200 },
      }),
      $defs: schema.$defs,
      required: ['workspace_id', 'name', 'content'],
    },
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
        artifact_id: { $ref: '#/$defs/id' },
        offset_bytes: { type: 'integer', minimum: 0 },
        limit_bytes: { type: 'integer', minimum: 1, maximum: 65536 },
      }),
      $defs: schema.$defs,
      anyOf: [{ required: ['reference'] }, { required: ['artifact_id'] }],
    },
  },
].map((tool) => ({
  ...tool,
  description: descriptions[tool.name],
}));
