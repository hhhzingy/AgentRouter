import { connect } from 'node:net';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// SSH stdio 桥(在 Core 所在主机上由 sshd forced command 调起):
//   agentrouter-ssh-bridge <dataDir>
// 认证:本地 endpoint.json 凭据(桥在可信主机侧读取,绝不经远端传入);
// 会话身份:一个 SSH 会话一条 Core 连接;协议与桌面 Main 管道帧一致。
const data = process.argv[2];
if (!data || process.env.AGENTROUTER_MANAGED_ROLE === '1') throw Error('SSH_BRIDGE_START_DENIED');
const endpoint = JSON.parse(readFileSync(resolve(data, 'endpoint.json'), 'utf8'));
if (
  typeof endpoint.address !== 'string' ||
  !endpoint.address.startsWith('\\\\.\\pipe\\AgentRouter-') ||
  typeof endpoint.credential !== 'string'
)
  throw Error('INVALID_LOCAL_ENDPOINT');
const socket = connect(endpoint.address);
let upstreamReady = false;
const downstreamQueue = [];
let upstreamQueue = [];
socket.on('connect', () => {
  socket.write(JSON.stringify({ credential: endpoint.credential }) + '\n');
});
let buf = '';
socket.on('data', (b) => {
  buf += b.toString('utf8');
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (!upstreamReady) {
      let frame;
      try {
        frame = JSON.parse(line);
      } catch {
        socket.destroy();
        return;
      }
      if (frame.attached !== true) {
        socket.destroy();
        return;
      }
      upstreamReady = true;
      for (const item of upstreamQueue) socket.write(item);
      upstreamQueue = [];
      for (const item of downstreamQueue) process.stdout.write(item);
      downstreamQueue.length = 0;
      continue;
    }
    process.stdout.write(line + '\n');
  }
});
process.stdin.on('data', (b) => {
  if (!upstreamReady) {
    upstreamQueue.push(b);
    return;
  }
  socket.write(b);
});
const die = () => {
  try {
    socket.destroy();
  } catch {}
  process.exit(0);
};
socket.on('close', die);
socket.on('error', die);
process.stdin.on('end', die);
