// Participant MCP 的 Streamable HTTP 入口(WN03 重写:业务在 participant-common 共享桥)。
// 云端 ChatGPT 用官方 Secure MCP Tunnel 指向本端口;手机/tailnet 内查看才使用 Tailscale Serve。
// 双层:外层 Bearer token(HTTP 访问控制);内层聊天级 grant(服务端 participant_grants 验证,
// 管理面签发;同角色新签发撤销旧 grant)。grant 不可由本入口自签;外层 token 不可当 provider key。
// 默认绑定 127.0.0.1;--allow-remote 才允许公网前接口(仍只建议经官方 Tunnel)。
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { parsePort, resolveGrant, openParticipantBridge, buildParticipantServer } from './participant-common.mjs';

const data = process.argv[2];
const roleId = process.argv[3];
if (!data || !roleId) throw Error('PARTICIPANT_HTTP_ARGS_REQUIRED');
let port;
try {
  port = parsePort(process.argv);
} catch (e) {
  console.error('PARTICIPANT_PORT_INVALID');
  process.exit(1);
}
const allowRemote = process.argv.includes('--allow-remote');
const tokenArgIndex = process.argv.indexOf('--token');
let token;
if (tokenArgIndex > 0 && tokenArgIndex + 1 < process.argv.length) token = process.argv[tokenArgIndex + 1];
const tokenFile = resolve(data, 'participant-token-' + roleId + '.txt');
if (!token && existsSync(tokenFile)) token = readFileSync(tokenFile, 'utf8').trim();
if (!token) {
  token = randomBytes(24).toString('hex');
  writeFileSync(tokenFile, token + '\n', { mode: 0o600 });
  console.error('PARTICIPANT_HTTP_TOKEN_GENERATED(写入受保护文件,首次启动输出到 stderr 供操作员接入):', tokenFile);
}
const grant = resolveGrant(data, roleId, process.argv);
const bridge = await openParticipantBridge({ data, roleId, grant });

const MAX_BODY = 1048576;
const httpServer = createServer((req, res) => {
  const finish = (code, obj) => {
    if (res.writableEnded) return;
    res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(obj));
  };
  const path = (req.url ?? '').split('?')[0];
  // Plain MCP(No Auth)不宣告 OAuth/PRM 元数据:探测在任何鉴权前一律 404(常量应答,无信息泄露)。
  if (req.method === 'GET' && path.startsWith('/.well-known/')) return finish(404, { error: 'NOT_FOUND' });
  const auth = req.headers.authorization ?? '';
  if (auth !== 'Bearer ' + token) return finish(401, { error: 'UNAUTHORIZED' });
  if (req.method === 'GET' && (path === '/health' || path === '/')) {
    return finish(200, { status: 'PARTICIPANT_HTTP_OK', role: roleId.slice(0, 14) + '…' });
  }
  // Plain MCP(No Auth)不宣告 OAuth/PRM 元数据:well-known 探测必须 404,
  // 405 会被 tunnel-client 判为"存在但无效"的 metadata 而阻塞 ready。
  if (req.method === 'GET' && path.startsWith('/.well-known/')) {
    return finish(404, { error: 'NOT_FOUND' });
  }
  if (req.method !== 'POST') return finish(405, { error: 'METHOD_NOT_ALLOWED' });
  // WN03/MCP-05:Buffer 累积(避免 chunk 边界 UTF-8 切断)、字节上限、end 竞态守卫。
  const chunks = [];
  let size = 0;
  let aborted = false;
  req.on('data', (c) => {
    if (aborted) return;
    size += c.length;
    if (size > MAX_BODY) {
      aborted = true;
      finish(413, { error: 'REQUEST_BODY_TOO_LARGE' });
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on('end', async () => {
    if (aborted) return;
    let parsed;
    try {
      parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch {
      return finish(400, { error: 'INVALID_REQUEST' });
    }
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    const server = buildParticipantServer(Server, ListToolsRequestSchema, CallToolRequestSchema, bridge.call);
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, parsed);
    } catch {
      finish(400, { error: 'INVALID_REQUEST' });
    } finally {
      try { await transport.close(); } catch {}
      try { await server.close(); } catch {}
    }
  });
  req.on('error', () => { if (!aborted) finish(400, { error: 'INVALID_REQUEST' }); });
});
const host = allowRemote ? '0.0.0.0' : '127.0.0.1';
httpServer.listen(port, host, () => {
  const actual = httpServer.address();
  const boundPort = typeof actual === 'object' && actual ? actual.port : port;
  console.log(JSON.stringify({
    status: 'STARTED',
    bound: host + ':' + boundPort,
    scope: 'PARTICIPANT_ROLE_TOOLS_ONLY',
    generation: bridge.info.generation,
    role: roleId.slice(0, 14) + '…',
    next_step: '优先官方 Secure MCP Tunnel 指向本端口;仅内网查看时再 tailscale serve https 127.0.0.1:' + boundPort,
  }));
});
process.on('SIGTERM', () => { httpServer.close(() => void bridge.close()); });
