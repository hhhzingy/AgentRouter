// Participant MCP 的 Streamable HTTP 入口(供网页 ChatGPT 经 Tailscale Serve 私网 HTTPS 连接)。
// 认证:Authorization: Bearer <token>;token 由启动参数或 --gen-token 生成,只存 .local,不入库不入 git。
// 权限:与 stdio 版一致,仅三个参与工具;AGENTROUTER_MANAGED_ROLE=1 不拦截本入口(它就是受管入口),
//       但必须显式提供 --allow-remote 才绑定非回环地址(默认 127.0.0.1,交给 tailscale serve 暴露)。
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { LocalCoreTransport } from '../../packages/client-transport/p1/local.ts';
const data = process.argv[2];
const roleId = process.argv[3];
const tokenArgIndex = process.argv.indexOf('--token');
const genToken = process.argv.includes('--gen-token');
const allowRemote = process.argv.includes('--allow-remote');
const port = Number(process.argv[process.argv.indexOf('--port') + 1] ?? 8790);
if (!data || !roleId) throw Error('PARTICIPANT_HTTP_ARGS_REQUIRED');
let token;
if (tokenArgIndex > 0) token = process.argv[tokenArgIndex + 1];
const tokenFile = resolve(data, 'participant-token.txt');
if (!token && genToken) {
  token = randomBytes(24).toString('hex');
  writeFileSync(tokenFile, token + '\n', { mode: 0o600 });
}
if (!token && existsSync(tokenFile)) token = readFileSync(tokenFile, 'utf8').trim();
if (!token) throw Error('PARTICIPANT_TOKEN_REQUIRED(--token 或 --gen-token)');
import Database from 'better-sqlite3';
{
  const db = new Database(data + '/router.db', { readonly: true });
  if (!db.prepare('select id from roles where id=?').get(roleId)) throw Error('PARTICIPANT_ROLE_NOT_FOUND');
  db.close();
}
const transport = new LocalCoreTransport(data);
const session = await transport.connect({
  clientId: 'participant_http_' + roleId.slice(0, 14),
  clientVersion: '1.0.0-dev.0',
  requestedMode: 'controller',
  contractRevision: 'C1R1P1',
  mode: 'LOCAL_CORE',
});
const snap = () => session.request('system.snapshot', {});
const lease = (
  await session.request(
    'control.acquire',
    {},
    { operationId: 'participant_http_lease', expectedRevision: (await snap()).revision, scope: {} },
  )
).leaseId;
const call = async (name, args = {}) => {
  if (name === 'participant_read_inbox') {
    return session.request('conversation.read', { role_id: roleId, limit: 100 });
  }
  if (name === 'participant_send_user_input') {
    const p = args.params ?? {};
    return session.request(
      'conversation.sendUserInput',
      { role_id: roleId, task_id: p.task_id, body: p.body },
      {
        operationId: 'part_' + randomUUID(),
        expectedRevision: (await snap()).revision,
        scope: {},
        leaseId: lease,
      },
    );
  }
  if (name === 'participant_register_artifact') {
    const p = args.params ?? {};
    return session.request(
      'participant.artifact',
      { role_id: roleId, name: p.name, content: p.content, ...(p.task_id ? { task_id: p.task_id } : {}) },
      { leaseId: lease },
    );
  }
  throw Error('TOOL_UNAVAILABLE');
};
const buildServer = () => {
  const server = new Server(
    { name: 'agentrouter-participant', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );
  const callLogged = async (name, args = {}) => {
    console.error('CALL_START:', name);
    try {
      const result = await call(name, args);
      console.error('CALL_OK:', name);
      return result;
    } catch (e) {
      console.error('CALL_ERROR:', name, String(e && (e.stack || e)).slice(0, 300));
      throw e;
    }
  };
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      { name: 'participant_read_inbox', description: '读取本角色的收件箱与对话(只读,限本角色)。', inputSchema: { type: 'object', additionalProperties: false, properties: {} } },
      { name: 'participant_send_user_input', description: '向本角色 WAITING_INPUT 任务发送用户输入。', inputSchema: { type: 'object', additionalProperties: false, required: ['params'], properties: { params: { type: 'object', additionalProperties: false, required: ['task_id', 'body'], properties: { task_id: { type: 'string' }, body: { type: 'string', maxLength: 4096 } } } } } },
      { name: 'participant_register_artifact', description: '把小型 markdown/json/txt 产物原子落盘到角色工作区并登记(≤256KB)。', inputSchema: { type: 'object', additionalProperties: false, required: ['params'], properties: { params: { type: 'object', additionalProperties: false, required: ['name', 'content'], properties: { name: { type: 'string', maxLength: 96 }, content: { type: 'string', maxLength: 393216 }, task_id: { type: 'string' } } } } } },
    ],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (r) => {
    try {
      return { content: [{ type: 'text', text: JSON.stringify(await callLogged(r.params.name, r.params.arguments ?? {})) }] };
    } catch (e) {
      const code = e.code ?? e.message;
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ error: /^[A-Z_]{1,80}$/.test(code ?? '') ? code : 'PARTICIPANT_REQUEST_FAILED' }) }],
      };
    }
  });
  return server;
};
const httpServer = createServer(async (req, res) => {
  const auth = req.headers.authorization ?? '';
  if (auth !== 'Bearer ' + token) {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'UNAUTHORIZED' }));
    return;
  }
  if (req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'PARTICIPANT_HTTP_OK', role: roleId.slice(0, 14) + '…' }));
    return;
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', async () => {
    // 无状态模式:每请求独立 Server+Transport(官方推荐);Core 会话与租约在闭包共享。
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = buildServer();
    await server.connect(transport);
    try {
      await transport.handleRequest(req, res, JSON.parse(body || '{}'));
    } catch (e) {
      console.error('HTTP_HANDLER_ERROR:', String(e && (e.stack || e)).slice(0, 400));
      if (!res.headersSent) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'INVALID_REQUEST' }));
      }
    }
  });
});
const host = allowRemote ? '0.0.0.0' : '127.0.0.1';
httpServer.listen(port, host, () => {
  const actual = httpServer.address();
  const boundPort = typeof actual === 'object' && actual ? actual.port : port;
  console.log(JSON.stringify({
    status: 'STARTED',
    bound: host + ':' + boundPort,
    scope: 'PARTICIPANT_ROLE_TOOLS_ONLY',
    role: roleId.slice(0, 14) + '…',
    nextStep: 'tailscale serve https 127.0.0.1:' + boundPort + ' 后在 ChatGPT 连接器填该 HTTPS URL 与 Bearer token',
  }));
});
