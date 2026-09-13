import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { LocalCoreTransport } from '../../packages/client-transport/p1/local.ts';
const data = process.argv[2], roleId = process.argv[3];
// ESM 无 require:崩溃诊断走 stderr(由 transport 管道捕获),不落盘。
process.on('uncaughtException', (e) => { console.error('PARTICIPANT_CRASH:', String(e && (e.stack || e))); throw e; });
process.on('unhandledRejection', (e) => console.error('PARTICIPANT_REJECTION:', String(e && (e.stack || e))));
if (!data || !roleId || process.env.AGENTROUTER_MANAGED_ROLE !== '1') throw Error('PARTICIPANT_START_DENIED');
import Database from 'better-sqlite3';
const db = new Database(data + '/router.db', { readonly: true });
if (!db.prepare('select id from roles where id=?').get(roleId)) throw Error('PARTICIPANT_ROLE_NOT_FOUND');
db.close();
const transport = new LocalCoreTransport(data);
const session = await transport.connect({
  clientId: 'participant_' + roleId.slice(0, 18),
  clientVersion: '1.0.0-dev.0',
  requestedMode: 'controller',
  contractRevision: 'C1R1P1',
  mode: 'LOCAL_CORE',
});
const snap = () => session.request('system.snapshot', {});
// grant 引导(与 HTTP 入口同流程):显式参数 > grant 文件 > --gen-token(管理面租约即放即用)。
const { readFileSync: rfs, writeFileSync: wfs, existsSync: exs } = await import('node:fs');
const { randomUUID } = await import('node:crypto');
const grantFile = data + '/participant-grant-' + roleId + '.json';
const gi = process.argv.indexOf('--grant');
const gt = process.argv.indexOf('--grant-token');
let grantCred;
if (gi > 0 && gt > 0) grantCred = { grant_id: process.argv[gi + 1], token: process.argv[gt + 1] };
else if (exs(grantFile)) grantCred = JSON.parse(rfs(grantFile, 'utf8'));
else if (process.argv.includes('--gen-token')) {
  const lease = await session.request('control.acquire', {}, { operationId: 'grant_bootstrap_' + randomUUID(), expectedRevision: (await snap()).revision, scope: {} });
  try {
    grantCred = await session.request('participant.grant.issue', { role_id: roleId, lease_id: lease.leaseId });
  } finally {
    await session.request('control.release', { lease_id: lease.leaseId }, { operationId: 'grant_release_' + randomUUID(), expectedRevision: (await snap()).revision, scope: {} });
  }
  wfs(grantFile, JSON.stringify({ grant_id: grantCred.grant_id, token: grantCred.token }), { mode: 0o600 });
} else throw Error('PARTICIPANT_GRANT_REQUIRED(--grant/--grant-token 或 --gen-token)');
const attachInfo = await session.request('participant.attach', { role_id: roleId, grant_id: grantCred.grant_id, grant_token: grantCred.token });
const attach = attachInfo.generation ?? 1;
const projectId = attachInfo.project_id;
const spaceId = attachInfo.space_id;
console.error('participant attached, generation', attach);
const server = new Server({ name: 'agentrouter-participant', version: '1.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: 'participant_read_inbox', description: '参与者:读取本角色的收件箱与对话(只读,限本角色)。', inputSchema: { type: 'object', additionalProperties: false, properties: {} }, annotations: { readOnlyHint: true } },
    { name: 'participant_send_user_input', description: '参与者:向本角色 WAITING_INPUT 任务发送用户输入(需要写权限)。', inputSchema: { type: 'object', additionalProperties: false, required: ['params'], properties: { params: { type: 'object', additionalProperties: false, required: ['task_id', 'body'], properties: { task_id: { type: 'string' }, body: { type: 'string', maxLength: 4096 } } } } } },
    { name: 'participant_register_artifact', description: '参与者:把小型 markdown/json/txt 产物原子落盘到角色工作区并登记(≤256KB)。', inputSchema: { type: 'object', additionalProperties: false, required: ['params'], properties: { params: { type: 'object', additionalProperties: false, required: ['name', 'content'], properties: { name: { type: 'string', maxLength: 96 }, content: { type: 'string', maxLength: 393216 }, task_id: { type: 'string' } } } } } },
  ],
}));
const call = async (name, args = {}) => {
  if (name === 'participant_read_inbox') {
    return session.request('conversation.read', { role_id: roleId, limit: 100 });
  }
  if (name === 'participant_send_user_input') {
    const p = args.params ?? {};
    return session.request('conversation.sendUserInput', { role_id: roleId, task_id: p.task_id, body: p.body }, { operationId: 'part_' + Math.random().toString(36).slice(2) + Date.now().toString(36), expectedRevision: (await snap()).revision, scope: { project_id: projectId, space_id: spaceId }, leaseId: 'participant-attachment' });
  }
  if (name === 'participant_register_artifact') {
    const p = args.params ?? {};
    return session.request('participant.artifact', { role_id: roleId, name: p.name, content: p.content, ...(p.task_id ? { task_id: p.task_id } : {}) });
  }
  throw Error('TOOL_UNAVAILABLE');
};
server.setRequestHandler(CallToolRequestSchema, async (r) => {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await call(r.params.name, r.params.arguments ?? {})) }] };
  } catch (e) {
    const code = (e).code ?? (e).message;
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: /^[A-Z_]{1,80}$/.test(code ?? '') ? code : 'PARTICIPANT_REQUEST_FAILED' }) }] };
  }
});
await server.connect(new StdioServerTransport());
process.stdin.on('end', () => { void transport.close(); });
