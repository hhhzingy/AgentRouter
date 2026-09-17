// WN03:Participant 共享业务桥(stdio/HTTP 两入口复用;不直读 router.db,一律 Core API)。
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { LocalCoreTransport } from '../../packages/client-transport/p1/local.ts';

export function parsePort(argv, fallback = 8790) {
  const i = argv.indexOf('--port');
  if (i < 0 || i + 1 >= argv.length) return fallback;
  const value = Number(argv[i + 1]);
  if (!Number.isInteger(value) || value < 0 || value > 65535) throw Error('PARTICIPANT_PORT_INVALID');
  return value;
}

/** WN03:grant 只接受显式提供(管理面签发)或既有受控文件;入口不再自签。 */
export function resolveGrant(data, roleId, argv) {
  const gi = argv.indexOf('--grant');
  const gt = argv.indexOf('--grant-token');
  if (gi > 0 && gt > 0 && gi + 1 < argv.length && gt + 1 < argv.length)
    return { grant_id: argv[gi + 1], token: argv[gt + 1] };
  const grantFile = resolve(data, 'participant-grant-' + roleId + '.json');
  if (existsSync(grantFile)) return JSON.parse(readFileSync(grantFile, 'utf8'));
  throw Error('PARTICIPANT_GRANT_REQUIRED(management-plane --grant/--grant-token)');
}

/** 写意图确定性 operationId:同 (role, tool, request_key) 恒定 → Core 账本幂等。 */
export function stableOperationId(roleId, tool, requestKey) {
  return 'mcp_p_' + createHash('sha256').update(roleId + '|' + tool + '|' + requestKey).digest('hex');
}

export async function openParticipantBridge({ data, roleId, grant }) {
  const transport = new LocalCoreTransport(data);
  const session = await transport.connect({
    clientId: 'participant_' + createHash('sha256').update(grant.grant_id).digest('hex').slice(0, 16),
    clientVersion: '1.0.0-dev.0',
    requestedMode: 'controller',
    contractRevision: 'C1R1P1',
    mode: 'LOCAL_CORE',
  });
  const snap = () => session.request('system.snapshot', {});
  const attachInfo = await session.request('participant.attach', {
    role_id: roleId,
    grant_id: grant.grant_id,
    grant_token: grant.token,
  });
  // 启动即走 Core 验证角色与 grant(participantValid 服务端复验;不再 SQL 探测)。
  await session.request('participant.inbox', { role_id: roleId });
  const projectId = attachInfo.project_id;
  const spaceId = attachInfo.space_id;
  const call = async (name, args = {}) => {
    if (name === 'participant_read_inbox') return session.request('participant.inbox', { role_id: roleId });
    if (name === 'participant_read_artifact') {
      const p = args.params ?? {};
      return session.request('participant.read_artifact', { role_id: roleId, task_id: p.task_id, artifact_id: p.artifact_id });
    }
    if (name === 'participant_send_user_input') {
      const p = args.params ?? {};
      if (typeof p.request_key !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(p.request_key))
        throw Error('REQUEST_KEY_REQUIRED');
      return session.request(
        'conversation.sendUserInput',
        { role_id: roleId, task_id: p.task_id, body: p.body },
        {
          operationId: stableOperationId(roleId, 'send_user_input', p.request_key),
          requestKey: p.request_key,
          expectedRevision: (await snap()).revision,
          scope: { project_id: projectId, space_id: spaceId },
          leaseId: 'participant-attachment',
        },
      );
    }
    if (name === 'participant_register_artifact') {
      const p = args.params ?? {};
      if (typeof p.request_key !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(p.request_key))
        throw Error('REQUEST_KEY_REQUIRED');
      return session.request('participant.artifact', {
        role_id: roleId,
        name: p.name,
        content: p.content,
        request_key: p.request_key,
        ...(p.task_id ? { task_id: p.task_id } : {}),
      });
    }
    throw Error('TOOL_UNAVAILABLE');
  };
  return { session, transport, call, close: () => transport.close(), info: { projectId, spaceId, generation: attachInfo.generation ?? 1 } };
}

export const PARTICIPANT_TOOLS = [
  {
    name: 'participant_read_inbox',
    description: '参与者:本角色任务收件箱(结构化;服务端复验 grant/代次/撤销;只读)。',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'participant_read_artifact',
    description: '参与者:读取指定任务已登记的产物(仅任务引用范围;返回 sha256/byte_size 版本;不开放任意文件读)。',
    inputSchema: { type: 'object', additionalProperties: false, required: ['params'], properties: { params: { type: 'object', additionalProperties: false, required: ['task_id', 'artifact_id'], properties: { task_id: { type: 'string' }, artifact_id: { type: 'string' } } } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'participant_send_user_input',
    description: '参与者:向本角色 WAITING_INPUT 任务补充输入。request_key 必填且重试保持不变(同键同意图返回同回执)。',
    inputSchema: { type: 'object', additionalProperties: false, required: ['params'], properties: { params: { type: 'object', additionalProperties: false, required: ['task_id', 'body', 'request_key'], properties: { task_id: { type: 'string' }, body: { type: 'string', maxLength: 4096 }, request_key: { type: 'string', maxLength: 128 } } } } },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'participant_register_artifact',
    description: '参与者:小型 markdown/json/txt 产物原子落盘并登记(≤256KB)。request_key 必填:重发同键同内容返回原 artifact 回执;同键异内容拒绝。',
    inputSchema: { type: 'object', additionalProperties: false, required: ['params'], properties: { params: { type: 'object', additionalProperties: false, required: ['name', 'content', 'request_key'], properties: { name: { type: 'string', maxLength: 96 }, content: { type: 'string', maxLength: 393216 }, task_id: { type: 'string' }, request_key: { type: 'string', maxLength: 128 } } } } },
    annotations: { readOnlyHint: false },
  },
];

export function buildParticipantServer(Server, ListToolsRequestSchema, CallToolRequestSchema, call) {
  const server = new Server({ name: 'agentrouter-participant', version: '1.1.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: PARTICIPANT_TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (r) => {
    try {
      return { content: [{ type: 'text', text: JSON.stringify(await call(r.params.name, r.params.arguments ?? {})) }] };
    } catch (e) {
      const code = e?.code ?? e?.message;
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: /^[A-Z_]{1,80}$/.test(String(code ?? '')) ? code : 'PARTICIPANT_REQUEST_FAILED' }) }] };
    }
  });
  return server;
}
