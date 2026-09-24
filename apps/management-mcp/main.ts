import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { LocalCoreTransport } from '../../packages/client-transport/p1/local.ts';
import { managementInputSchema } from '../../packages/management-gateway/schema.ts';
import { ManagementGateway } from '../../packages/management-gateway/index.ts';
import {
  managementMutationCommandProperties,
  roleSessionCommandProperties,
  validateManagementMutationCommand,
  validateRoleSessionCommand,
} from '../../packages/management-gateway/role-session-command.ts';
import { assertManagementLauncher, visibleManagementTools } from './launcher-guard.ts';
const data = process.argv[2],
  mode = process.argv[3] ?? 'observer',
  clientId = process.argv[4] ?? 'mcp_management_codex';
assertManagementLauncher({
  data,
  mode,
  clientId,
  managedRole: process.env.AGENTROUTER_MANAGED_ROLE,
});
const gateway = new ManagementGateway(
  new LocalCoreTransport(data),
  mode as 'observer' | 'controller',
  clientId,
  // WN04:管理面的项目范围由所连专用 core 进程的启动参数固定;启动时校验环境变量与端点一致性由操作员卡保证。
);
const server = new Server(
  { name: 'agentrouter-management', version: '1.0.0' },
  { capabilities: { tools: {} } },
);
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: visibleManagementTools([
    ...gateway.tools().map((t) => ({
      name: t.name,
      description: `AgentRouter LOCAL_CORE ${t.method}. Core合同参数放在params；写入必须稳定request_key和expected_revision，不重放未知副作用。`,
      inputSchema: managementInputSchema(t.name, t.method),
      annotations: { readOnlyHint: !t.mutation, destructiveHint: t.mutation, openWorldHint: false },
    })),
    {
      name: 'router_role_session_list',
      description: 'AgentRouter RoleSession 连续性：列出指定角色的工作会话与当前活动会话。',
      inputSchema: { type: 'object' as const, additionalProperties: false, required: ['params'], properties: { params: { type: 'object' as const, additionalProperties: false, required: ['role_id'], properties: { role_id: { type: 'string' } } } } },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    {
      name: 'router_role_session_preflight',
      description: 'AgentRouter RoleSession 连续性：评估目标 Harness 可继续的最新会话、新建并继承上下文的可用性与迁移保真度。',
      inputSchema: { type: 'object' as const, additionalProperties: false, required: ['params'], properties: { params: { type: 'object' as const, additionalProperties: false, required: ['role_id'], properties: { role_id: { type: 'string' }, target_harness: { type: 'string' }, session_id: { type: 'string' } } } } },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    {
      name: 'router_role_session_history',
      description: 'AgentRouter RoleSession 连续性：读取指定会话的可观察对话历史（按会话隔离）。',
      inputSchema: { type: 'object' as const, additionalProperties: false, required: ['params'], properties: { params: { type: 'object' as const, additionalProperties: false, required: ['role_id', 'session_id'], properties: { role_id: { type: 'string' }, session_id: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 500 } } } } },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    {
      name: 'router_role_session_create',
      description: 'AgentRouter RoleSession 连续性：新建并激活工作会话，继承最大可迁移上下文（需要控制租约）。',
      inputSchema: { type: 'object' as const, additionalProperties: false, required: ['params'], properties: { params: { type: 'object' as const, additionalProperties: false, required: ['role_id', 'name'], properties: { role_id: { type: 'string' }, name: { type: 'string', maxLength: 80 }, target_harness: { type: 'string' }, context_mode: { enum: ['blank', 'inherit'] } } } } },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    {
      name: 'router_role_session_transfer_status',
      description: '查询一次性 Context Transfer 操作状态(role 与 op 必须对应;inherit 创建返回的 transfer.op_id 在此核对;只读)。',
      inputSchema: { type: 'object' as const, additionalProperties: false, required: ['params'], properties: { params: { type: 'object' as const, additionalProperties: false, required: ['role_id', 'op_id'], properties: { role_id: { type: 'string' }, op_id: { type: 'string' } } } } },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    {
      name: 'router_participant_slot_list',
      description: '列出指定 Role 的 Participant/Managed WorkSession Slot；observer 可读且受服务端 project scope 限制。',
      inputSchema: { type: 'object' as const, additionalProperties: false, required: ['params'], properties: { params: { type: 'object' as const, additionalProperties: false, required: ['role_id'], properties: { role_id: { type: 'string' } } } } },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    {
      name: 'router_participant_slot_create',
      description: '创建显式 Participant Slot；需要 controller lease、稳定 request_key 与 expected_revision。',
      inputSchema: { type: 'object' as const, additionalProperties: false, required: ['params'], properties: { params: { type: 'object' as const, additionalProperties: false, required: ['role_id', 'name', 'participant_kind'], properties: { role_id: { type: 'string' }, name: { type: 'string', minLength: 1, maxLength: 80 }, participant_kind: { enum: ['CHATGPT_WEB', 'MANAGED_HARNESS', 'PAIR_CODE'] }, work_session_id: { type: 'string' } } } } },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    {
      name: 'router_participant_slot_leave',
      description: '关闭 Slot 并归档已 drain 的 WorkSession；未完成 Task/Run 时拒绝。需要 controller lease 与稳定命令元数据。',
      inputSchema: { type: 'object' as const, additionalProperties: false, required: ['params'], properties: { params: { type: 'object' as const, additionalProperties: false, required: ['role_id', 'slot_id'], properties: { role_id: { type: 'string' }, slot_id: { type: 'string' } } } } },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
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
  ], mode).map((tool) => tool.name === 'router_role_session_create' ? {
    ...tool,
    description: tool.description + ' 保存 request_key、expected_revision 与 preflight_hash；响应丢失时原样重试整个命令。',
    inputSchema: {
      ...tool.inputSchema,
      required: ['params', 'request_key', 'expected_revision', 'preflight_hash'],
      properties: { ...tool.inputSchema.properties, ...roleSessionCommandProperties },
    },
  } : ['router_participant_slot_create', 'router_participant_slot_leave'].includes(tool.name) ? {
    ...tool,
    description: tool.description + ' 响应丢失时只允许原样重试相同 request_key/expected_revision。',
    inputSchema: {
      ...tool.inputSchema,
      required: ['params', 'request_key', 'expected_revision'],
      properties: { ...tool.inputSchema.properties, ...managementMutationCommandProperties },
    },
  } : tool),
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
    if (r.params.name?.startsWith('router_role_session_')) {
      const a = (r.params.arguments ?? {}) as { params?: Record<string, unknown> };
      const q = a.params ?? {};
      let result: unknown;
      if (r.params.name === 'router_role_session_list')
        result = await gateway.roleSessionList(String(q.role_id ?? ''));
      else if (r.params.name === 'router_role_session_preflight')
        result = await gateway.roleSessionPreflight(String(q.role_id ?? ''), q.target_harness ? String(q.target_harness) : undefined, q.session_id ? String(q.session_id) : undefined);
      else if (r.params.name === 'router_role_session_history')
        result = await gateway.roleSessionHistory(String(q.role_id ?? ''), String(q.session_id ?? ''), q.limit ? Number(q.limit) : undefined);
      else if (r.params.name === 'router_role_session_create')
        result = await gateway.roleSessionCreate(String(q.role_id ?? ''), String(q.name ?? ''), q.target_harness ? String(q.target_harness) : undefined, validateRoleSessionCommand(a), q.context_mode === 'inherit' ? 'inherit' : 'blank');
      else if (r.params.name === 'router_role_session_transfer_status')
        result = await gateway.roleSessionTransferStatus(String(q.role_id ?? ''), String(q.op_id ?? ''));
      else throw Error('TOOL_UNAVAILABLE');
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
    if (r.params.name?.startsWith('router_participant_slot_')) {
      const a = (r.params.arguments ?? {}) as { params?: Record<string, unknown> };
      const q = a.params ?? {};
      let result: unknown;
      if (r.params.name === 'router_participant_slot_list')
        result = await gateway.participantSlotList(String(q.role_id ?? ''));
      else if (r.params.name === 'router_participant_slot_create')
        result = await gateway.participantSlotCreate({
          role_id: String(q.role_id ?? ''),
          name: String(q.name ?? ''),
          participant_kind: String(q.participant_kind ?? '') as 'CHATGPT_WEB' | 'MANAGED_HARNESS' | 'PAIR_CODE',
          ...(q.work_session_id ? { work_session_id: String(q.work_session_id) } : {}),
        }, validateManagementMutationCommand(a));
      else if (r.params.name === 'router_participant_slot_leave')
        result = await gateway.participantSlotLeave(
          String(q.role_id ?? ''),
          String(q.slot_id ?? ''),
          validateManagementMutationCommand(a),
        );
      else throw Error('TOOL_UNAVAILABLE');
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
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
