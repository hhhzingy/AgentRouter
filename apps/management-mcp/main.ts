import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { LocalCoreTransport } from '../../packages/client-transport/p1/local.ts';
import { managementInputSchema } from '../../packages/management-gateway/schema.ts';
import { ManagementGateway } from '../../packages/management-gateway/index.ts';
const data = process.argv[2],
  mode = process.argv[3] ?? 'observer',
  clientId = process.argv[4] ?? 'mcp_management_codex';
if (
  !data ||
  !['observer', 'controller'].includes(mode) ||
  !/^mcp_management_[A-Za-z0-9_.:-]{1,100}$/.test(clientId) ||
  process.env.AGENTROUTER_MANAGED_ROLE === '1'
)
  throw Error('MANAGEMENT_START_DENIED');
const gateway = new ManagementGateway(
  new LocalCoreTransport(data),
  mode as 'observer' | 'controller',
  clientId,
);
const server = new Server(
  { name: 'agentrouter-management', version: '1.0.0' },
  { capabilities: { tools: {} } },
);
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    ...gateway.tools().map((t) => ({
      name: t.name,
      description: `AgentRouter LOCAL_CORE ${t.method}. Core合同参数放在params；写入必须稳定request_key和expected_revision，不重放未知副作用。`,
      inputSchema: managementInputSchema(t.name, t.method),
      annotations: { readOnlyHint: !t.mutation, destructiveHint: t.mutation, openWorldHint: false },
    })),
    {
      name: 'router_external_api_list',
      description:
        'AgentRouter external-api/1扩展：列出Core固定注册的External API Profile与动作。旧Core不支持时返回错误，不降级为直接HTTP。',
      inputSchema: { type: 'object' as const, additionalProperties: false, properties: {} },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    {
      name: 'router_external_api_describe',
      description: 'AgentRouter external-api/1扩展：描述单个动作的输入schema与副作用级别。',
      inputSchema: {
        type: 'object' as const,
        additionalProperties: false,
        required: ['params'],
        properties: {
          params: {
            type: 'object' as const,
            additionalProperties: false,
            required: ['profile_id', 'action_id'],
            properties: { profile_id: { type: 'string' }, action_id: { type: 'string' } },
          },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    {
      name: 'router_external_api_call',
      description:
        'AgentRouter external-api/1扩展：调用已注册动作。需要控制租约与稳定request_key；非只读动作先返回PREVIEW确认指纹，未知结局不自动重试。',
      inputSchema: {
        type: 'object' as const,
        additionalProperties: false,
        required: ['params'],
        properties: {
          params: {
            type: 'object' as const,
            additionalProperties: false,
            required: ['profile_id', 'action_id', 'args', 'request_key'],
            properties: {
              profile_id: { type: 'string' },
              action_id: { type: 'string' },
              args: { type: 'object' },
              request_key: { type: 'string', pattern: '^[A-Za-z0-9_.:-]{1,128}$' },
              confirm: { type: 'string', pattern: '^[a-f0-9]{64}$' },
            },
          },
        },
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
  ],
}));
server.setRequestHandler(CallToolRequestSchema, async (r) => {
  try {
    if (r.params.name === 'router_external_api_list')
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(await gateway.externalApiList()) }],
      };
    if (r.params.name === 'router_external_api_describe') {
      const p = (r.params.arguments ?? {}) as { params?: Record<string, unknown> };
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              await gateway.externalApiDescribe(
                String(p.params?.profile_id ?? ''),
                String(p.params?.action_id ?? ''),
              ),
            ),
          },
        ],
      };
    }
    if (r.params.name === 'router_external_api_call') {
      const a = (r.params.arguments ?? {}) as { params?: Record<string, unknown> };
      if (!a.params || !a.params.request_key) throw Error('REQUEST_KEY_AND_REVISION_REQUIRED');
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(await gateway.externalApiCall({ params: a.params })),
          },
        ],
      };
    }
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(await gateway.call(r.params.name, r.params.arguments ?? {})),
        },
      ],
    };
  } catch (e) {
    const error = e as { code?: string; message?: string; category?: string };
    const code = error.code ?? error.message;
    const allowed = code && /^[A-Z_]{1,80}$/.test(code) ? code : 'MANAGEMENT_REQUEST_FAILED';
    const unknown =
      error.category === 'AMBIGUOUS' || ['REQUEST_TIMEOUT', 'CONNECTION_LOST'].includes(allowed);
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            error: allowed,
            category: unknown ? 'AMBIGUOUS' : 'REJECTED',
            unknownOutcome: unknown,
            ...(unknown ? { recovery: 'QUERY_STATE_OR_RETRY_IDENTICAL_REQUEST_KEY' } : {}),
          }),
        },
      ],
    };
  }
});
try {
  await gateway.connect();
  await server.connect(new StdioServerTransport());
} catch {
  process.stderr.write('MANAGEMENT_CORE_CONNECT_FAILED\n');
  await gateway.close();
  process.exitCode = 1;
}
process.stdin.on('end', () => {
  void gateway.close();
});
