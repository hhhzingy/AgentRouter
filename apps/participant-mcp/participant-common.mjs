// WN03:Participant 共享业务桥(stdio/HTTP 两入口复用;不直读 router.db,一律 Core API)。
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { LocalCoreTransport } from '../../packages/client-transport/p1/local.ts';

export function parsePort(argv, fallback = 8790) {
  const i = argv.indexOf('--port');
  if (i < 0 || i + 1 >= argv.length) return fallback;
  const value = Number(argv[i + 1]);
  if (!Number.isInteger(value) || value < 0 || value > 65535)
    throw Error('PARTICIPANT_PORT_INVALID');
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
  return (
    'mcp_p_' +
    createHash('sha256')
      .update(roleId + '|' + tool + '|' + requestKey)
      .digest('hex')
  );
}

export async function openParticipantBridge({ data, roleId, grant }) {
  const transport = new LocalCoreTransport(data);
  const session = await transport.connect({
    clientId:
      'participant_' + createHash('sha256').update(grant.grant_id).digest('hex').slice(0, 16),
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
  const frameMemo = new Map(); // operationId → { biz, expectedRevision }(见 send_user_input 注释)
  const call = async (name, args = {}) => {
    if (name === 'participant_read_inbox')
      return session.request('participant.inbox', { role_id: roleId });
    if (name === 'participant_read_artifact') {
      const p = args.params ?? {};
      return session.request('participant.read_artifact', {
        role_id: roleId,
        task_id: p.task_id,
        artifact_id: p.artifact_id,
      });
    }
    if (name === 'participant_send_user_input') {
      const p = args.params ?? {};
      if (typeof p.request_key !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(p.request_key))
        throw Error('REQUEST_KEY_REQUIRED');
      // C1R1 重放要求同字节帧(hash 含 expected_revision)。桥侧为同 operationId+同意图
      // 复用首发帧,使 MCP 语义"同键同意图 → 同回执"成立;异参仍由 Core 判冲突。
      const opId = stableOperationId(roleId, 'send_user_input', p.request_key);
      const biz = JSON.stringify({ task_id: p.task_id, body: p.body });
      const prior = frameMemo.get(opId);
      // 首发帧一旦记录就不再覆盖:同 biz 重试恒复放原帧;异 biz 用新 revision 交由 Core 判冲突。
      let expectedRevision;
      if (!prior) {
        expectedRevision = (await snap()).revision;
        frameMemo.set(opId, { biz, expectedRevision });
      } else if (prior.biz === biz) {
        expectedRevision = prior.expectedRevision;
      } else {
        expectedRevision = (await snap()).revision;
      }
      return session.request(
        'conversation.sendUserInput',
        { role_id: roleId, task_id: p.task_id, body: p.body },
        {
          operationId: opId,
          requestKey: p.request_key,
          expectedRevision,
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
    if (name === 'participant_claim_task') {
      const p = args.params ?? {};
      if (typeof p.request_key !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(p.request_key))
        throw Error('REQUEST_KEY_REQUIRED');
      return session.request('participant.claim', {
        role_id: roleId,
        task_id: p.task_id,
        request_key: p.request_key,
      });
    }
    if (name === 'participant_request_user_input') {
      const p = args.params ?? {};
      if (typeof p.request_key !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(p.request_key))
        throw Error('REQUEST_KEY_REQUIRED');
      return session.request('participant.request_user_input', {
        role_id: roleId,
        task_id: p.task_id,
        request_key: p.request_key,
        reason: p.reason,
      });
    }
    if (name === 'participant_submit_result') {
      const p = args.params ?? {};
      if (typeof p.request_key !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(p.request_key))
        throw Error('REQUEST_KEY_REQUIRED');
      return session.request('participant.submit_result', {
        role_id: roleId,
        task_id: p.task_id,
        request_key: p.request_key,
        outcome: p.outcome,
        summary: p.summary,
        body: p.body,
        ...(Array.isArray(p.outputs) ? { outputs: p.outputs } : {}),
      });
    }
    throw Error('TOOL_UNAVAILABLE');
  };
  return {
    session,
    transport,
    call,
    close: () => transport.close(),
    info: { projectId, spaceId, generation: attachInfo.generation ?? 1 },
  };
}

export const PARTICIPANT_TOOLS = [
  {
    name: 'participant_read_inbox',
    description:
      '参与者:本角色结构化任务收件箱。每个任务含 id/state/summary/body(任务原文,含口令与验收要求)/inputs(必需输入引用,含 name/sha/bytes)/expected(验收标准)/completion(结果目标)/acceptance/等待状态。服务端复验 grant/代次/撤销;只读。任务要求必须从这里读取,不要凭聊天转述。',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'participant_claim_task',
    description:
      '参与者:认领任务。QUEUED→ACTIVE 开始工作;或 WAITING_INPUT(用户输入已就绪)→ACTIVE 继续推进。request_key 必填,重试保持不变(同键同意图返回原回执,异内容冲突)。',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['params'],
      properties: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['task_id', 'request_key'],
          properties: {
            task_id: { type: 'string' },
            request_key: { type: 'string', maxLength: 128 },
          },
        },
      },
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'participant_request_user_input',
    description:
      '参与者:对已认领(ACTIVE)任务显式声明需要用户补充输入,任务转 WAITING_INPUT。随后由 participant_send_user_input 接收用户输入,再用 participant_claim_task 继续。request_key 必填幂等。',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['params'],
      properties: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['task_id', 'reason', 'request_key'],
          properties: {
            task_id: { type: 'string' },
            reason: { type: 'string', maxLength: 2048 },
            request_key: { type: 'string', maxLength: 128 },
          },
        },
      },
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'participant_submit_result',
    description:
      '参与者:提交业务结果(不登记 Artifact 不代表完成;提交结果才会推进到 RESULT/DELIVERED)。outcome 仅 succeeded|failed;succeeded 需先登记产物并经 outputs 引用。结果发布给 completion 目标,用户验收(result.accept)是独立的人类批准,本工具不代替。request_key 必填幂等。',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['params'],
      properties: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['task_id', 'outcome', 'summary', 'body', 'request_key'],
          properties: {
            task_id: { type: 'string' },
            outcome: { type: 'string', enum: ['succeeded', 'failed'] },
            summary: { type: 'string', maxLength: 512 },
            body: { type: 'string', maxLength: 65536 },
            outputs: {
              type: 'array',
              maxItems: 32,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['kind', 'artifact_id'],
                properties: { kind: { const: 'artifact' }, artifact_id: { type: 'string' } },
              },
            },
            request_key: { type: 'string', maxLength: 128 },
          },
        },
      },
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'participant_read_artifact',
    description:
      '参与者:读取指定任务已登记的产物(仅任务引用范围;返回 sha256/byte_size 版本;不开放任意文件读)。',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['params'],
      properties: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['task_id', 'artifact_id'],
          properties: { task_id: { type: 'string' }, artifact_id: { type: 'string' } },
        },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'participant_send_user_input',
    description:
      '参与者:向本角色 WAITING_INPUT 任务补充输入。request_key 必填且重试保持不变(同键同意图返回同回执)。',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['params'],
      properties: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['task_id', 'body', 'request_key'],
          properties: {
            task_id: { type: 'string' },
            body: { type: 'string', maxLength: 4096 },
            request_key: { type: 'string', maxLength: 128 },
          },
        },
      },
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'participant_register_artifact',
    description:
      '参与者:小型 markdown/json/txt 产物原子落盘并登记(≤256KB)。request_key 必填:重发同键同内容返回原 artifact 回执;同键异内容拒绝。',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['params'],
      properties: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'content', 'request_key'],
          properties: {
            name: { type: 'string', maxLength: 96 },
            content: { type: 'string', maxLength: 393216 },
            task_id: { type: 'string' },
            request_key: { type: 'string', maxLength: 128 },
          },
        },
      },
    },
    annotations: { readOnlyHint: false },
  },
];

export function buildParticipantServer(
  Server,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  call,
) {
  const server = new Server(
    { name: 'agentrouter-participant', version: '1.1.0' },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: PARTICIPANT_TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (r) => {
    try {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(await call(r.params.name, r.params.arguments ?? {})),
          },
        ],
      };
    } catch (e) {
      const code = e?.code ?? e?.message;
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: /^[A-Z_]{1,80}$/.test(String(code ?? ''))
                ? code
                : 'PARTICIPANT_REQUEST_FAILED',
            }),
          },
        ],
      };
    }
  });
  return server;
}
