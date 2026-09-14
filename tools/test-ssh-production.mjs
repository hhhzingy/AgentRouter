import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
// 真实 SSH 生产 E2E:本机 sshd → forced command → ssh-bridge → Core 命名管道。
// 稳定布局:密钥/数据目录/授权行跨运行不变,提权安装一次后可反复验收;不触碰用户既有键。
if (!process.argv.includes('--live')) throw Error('EXPLICIT_LIVE_FLAG_REQUIRED');
mkdirSync('.local/ssh-e2e', { recursive: true });
const root = resolve('.local/ssh-e2e');
const path = (n) => resolve(root, n);
rmSync(path('data'), { recursive: true, force: true });
for (const dir of ['data/core', 'data/workspace']) mkdirSync(path(dir), { recursive: true });
const user = process.env.USERNAME ?? process.env.USER;
if (!user) throw Error('SSH_USER_UNKNOWN');
const report = {
  scope: 'PRODUCTION_SSH_BRIDGE_REAL_SSHD',
  status: 'FAIL',
  code_sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty_source: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  checks: [],
  user,
};
let core, ssh;
try {
  if (!existsSync('.local/w11-core/ssh-bridge.mjs')) throw Error('SSH_BRIDGE_NOT_BUILT');
  // 1) 真实 Core:LIMITED_ISOLATION 运行时 + 命名管道 endpoint
  core = spawn(process.execPath, [resolve('.local/w11-core/core.mjs')], {
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: {
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      PATH: process.env.PATH,
      TEMP: root,
      TMP: root,
      AGENTROUTER_DATA: path('data/core'),
      AGENTROUTER_PROJECT_ROOTS: JSON.stringify([path('data/workspace')]),
    },
  });
  for (let i = 0; i < 100 && !existsSync(path('data/core/endpoint.json')); i++)
    await new Promise((r) => setTimeout(r, 100));
  if (!existsSync(path('data/core/endpoint.json'))) throw Error('CORE_START_FAILED');
  const endpoint = JSON.parse(readFileSync(path('data/core/endpoint.json'), 'utf8'));
  if (!String(endpoint.address).startsWith('\\\\.\\pipe\\AgentRouter-')) throw Error('INVALID_ENDPOINT');
  report.checks.push('真实Core命名管道endpoint就绪');

  // 2) 稳定临时密钥;授权行经提权安装脚本一次写入(install-auth.ps1 幂等)
  if (!existsSync(path('e2e-key')))
    execFileSync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-C', 'agentrouter-ssh-e2e', '-f', path('e2e-key')], { stdio: 'pipe' });
  const bridgeArg = resolve('.local/w11-core/ssh-bridge.mjs');
  if (/[ "']/.test(String(root)) || /[ "']/.test(bridgeArg)) throw Error('PATH_WITH_SPACE_UNSUPPORTED');
  const pub = readFileSync(path('e2e-key.pub'), 'utf8').trim();
  const authLine = 'command="node ' + bridgeArg.replaceAll('\\', '/') + ' ' + String(root).replaceAll('\\', '/') + '/data" ' + pub;
  const authPath = 'C:/ProgramData/ssh/administrators_authorized_keys';
  const ps1 = [
    "$path = 'C:/ProgramData/ssh/administrators_authorized_keys'",
    '$line = @\'',
    authLine,
    "'@",
    '$text = [IO.File]::ReadAllText($path)',
    'if ($text -notlike \'*agentrouter-ssh-e2e*\') {',
    "  [IO.File]::AppendAllText($path, \"# agentrouter-ssh-e2e`n$line`n\")",
    "  Write-Output 'installed'",
    '} else { Write-Output ' + "'already-present'" + ' }',
  ].join('\n');
  writeFileSync(path('install-auth.ps1'), ps1 + '\n', 'utf8');
  let present = false;
  try {
    present = readFileSync(authPath, 'utf8').includes('agentrouter-ssh-e2e');
  } catch {
    throw Error('PENDING_ELEVATED_INSTALL: powershell -NoProfile -ExecutionPolicy Bypass -File ' + path('install-auth.ps1'));
  }
  if (!present) {
    try {
      appendFileSync(authPath, '# agentrouter-ssh-e2e\n' + authLine + '\n', 'utf8');
      report.checks.push('追加forced-command授权行');
    } catch {
      throw Error('PENDING_ELEVATED_INSTALL: powershell -NoProfile -ExecutionPolicy Bypass -File ' + path('install-auth.ps1'));
    }
  } else report.checks.push('forced-command授权行已就绪');

  // 3) 真实 ssh 连接(独立 known_hosts,不动用户既有记录)
  ssh = spawn(
    'ssh',
    [
      '-i', path('e2e-key'),
      '-o', 'BatchMode=yes',
      '-o', 'IdentitiesOnly=yes',
      '-o', 'StrictHostKeyChecking=yes',
      '-o', 'UserKnownHostsFile=' + path('known_hosts'),
      '-o', 'ConnectTimeout=10',
      user + '@localhost',
    ],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  let buf = '';
  const pending = new Map();
  let seq = 0;
  ssh.stdout.on('data', (b) => {
    buf += b.toString('utf8');
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      let frame;
      try { frame = JSON.parse(line); } catch { continue; }
      const waiter = pending.get(frame.id);
      if (waiter) {
        pending.delete(frame.id);
        clearTimeout(waiter.timer);
        waiter.resolve(frame);
      }
    }
  });
  const request = (method, params, timeoutMs = 15000) =>
    new Promise((res, rej) => {
      const id = 'ssh_req_' + ++seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        rej(Error('REQUEST_TIMEOUT:' + method));
      }, timeoutMs);
      pending.set(id, { timer, resolve: res });
      ssh.stdin.write(JSON.stringify({ v: 1, id, method, params }) + '\n');
    });
  // 桥会把 attached 前的早到帧排队后回放,initialize 直发即可
  const hello = await request('system.initialize', {
    client_protocol: 'agentrouter-client/1',
    client_version: '1.0.0',
    client_id: 'ssh_e2e_observer',
    requested_mode: 'observer',
    contract_revision: 'C1R1P1',
  });
  if (hello.error) throw Error('SSH_HELLO_REJECTED:' + hello.error.code);
  if (hello.result?.connectionState !== 'CONNECTED_OBSERVER') throw Error('SSH_HELLO_NOT_OBSERVER');
  report.checks.push('经真实sshd与桥完成C1初始化(observer)');

  // 4) 观察者读成功
  const snap = await request('system.snapshot', {});
  if (snap.error || typeof snap.result?.revision !== 'number') throw Error('SSH_READ_FAILED');
  report.checks.push('SSH观察者真实读(system.snapshot)');

  // 5) 观察者写被拒
  const denied = await request('project.create', { name: 'ssh-e2e-不应成功', path_handle: 'x' });
  if (!denied.error || !['SCOPE_DENIED', 'CONTROL_LEASE_REQUIRED'].includes(denied.error.code))
    throw Error('SSH_WRITE_NOT_DENIED');
  report.checks.push('SSH观察者写被拒(冻结合同口径)');

  report.status = 'PASS';
} catch (error) {
  report.error = String(error.message).slice(0, 200);
  report.error_stack = String(error.stack ?? '').split('\n').slice(0, 5).join(' | ');
} finally {
  try { ssh?.kill(); } catch {}
  // 授权行保留(install-auth.ps1 幂等);移除需提权执行:删除含 agentrouter-ssh-e2e 的行
  report.auth_line_retained = true;
  try { core?.kill('SIGTERM'); } catch {}
  writeFileSync(path('report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ report: path('report.json'), ...report }));
}
if (report.status !== 'PASS') process.exitCode = 1;
