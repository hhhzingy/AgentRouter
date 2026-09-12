import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { LocalCoreTransport } from '../../packages/client-transport/p1/local.ts';
const data = process.argv[2], roleId = process.argv[3];
process.on('uncaughtException', (e) => { try { require('node:fs').writeFileSync(data + '/participant-crash.log', String(e && e.stack || e)); } catch {} throw e; });
process.on('unhandledRejection', (e) => { try { require('node:fs').writeFileSync(data + '/participant-crash.log', 'REJECTION:' + String(e && ((e).stack || e))); } catch {} });
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
const lease = (await session.request('control.acquire', {}, { operationId: 'participant_lease', expectedRevision: (await snap()).revision, scope: {} })).leaseId;
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
    return session.request('conversation.sendUserInput', { role_id: roleId, task_id: p.task_id, body: p.body }, { operationId: 'part_' + Math.random().toString(36).slice(2) + Date.now().toString(36), expectedRevision: (await snap()).revision, scope: {}, leaseId: lease });
  }
  if (name === 'participant_register_artifact') {
    const p = args.params ?? {};
    return session.request('participant.artifact', { role_id: roleId, name: p.name, content: p.content, ...(p.task_id ? { task_id: p.task_id } : {}) }, { leaseId: lease });
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
