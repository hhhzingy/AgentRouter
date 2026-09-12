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
  tools: gateway.tools().map((t) => ({
    name: t.name,
    description: `AgentRouter LOCAL_CORE ${t.method}. Core合同参数放在params；写入必须稳定request_key和expected_revision，不重放未知副作用。`,
    inputSchema: managementInputSchema(t.name, t.method),
    annotations: { readOnlyHint: !t.mutation, destructiveHint: t.mutation, openWorldHint: false },
  })),
}));
server.setRequestHandler(CallToolRequestSchema, async (r) => {
  try {
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
