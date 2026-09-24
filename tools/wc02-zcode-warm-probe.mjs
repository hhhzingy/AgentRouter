// WC02 探针:zcode 0.16.5 同一 app-server 进程内,同一 session 连续两轮,
// 第二轮依赖第一轮信息 → 验证"warm 会话连续"在协议层是否可行(为 backend 驻留策略提供事实)。
// 仅输出脱敏结论;key 不落日志。
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prepareManagedZcodeProfile } from '../packages/platform/zcode-managed-profile.ts';
if (!process.argv.includes('--live')) throw Error('EXPLICIT_LIVE_FLAG_REQUIRED');
const home = resolve('.local/wc02-warm-probe/home');
mkdirSync(home + '/bin', { recursive: true });
mkdirSync(home + '/tmp', { recursive: true });
const lines = readFileSync('E:/AgentRouter/账号信息/通用API/百炼.txt', 'utf8').split(/\r?\n/).map((l) => l.trim());
const url = lines.find((l) => /^https/.test(l));
const key = lines[lines.findIndex((l) => /^api_key$/i.test(l)) + 1];
prepareManagedZcodeProfile(home, { main: 'bailian/qwen3.8-flash', provider: { id: 'bailian', kind: 'openai-compatible', baseURL: url, name: 'Bailian' } });
const child = spawn(process.execPath, ['E:/software/ZCode/resources/glm/zcode.cjs', 'app-server'], {
  cwd: home,
  env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: home + '/bin', USERPROFILE: home, HOME: home, APPDATA: home + '/AppData/Roaming', LOCALAPPDATA: home + '/AppData/Local', ZCODE_API_KEY: key, AGENTROUTER_MANAGED_ROLE: '1' },
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
});
const send = (o) => child.stdin.write(JSON.stringify(o) + '\n');
const msgs = [];
let sid = null;
let terminalCount = 0;
child.stdout.on('data', (d) => {
  for (const line of String(d).split('\n')) {
    if (!line.trim()) continue;
    let x; try { x = JSON.parse(line); } catch { continue; }
    if (x.method === 'session/requestRuntimePreferences') { send({ id: x.id, result: { nativeSearchEnhancementsEnabled: false, memoryEnabled: false, askUserQuestionAutoResolutionEnabled: false } }); continue; }
    if (x.method === 'interaction/requestPermission') { const deny = (x.params?.options ?? []).find((o) => o.kind === 'deny'); send({ id: x.id, result: deny?.response ?? { decision: 'deny' } }); continue; }
    if (x.id === 1 && x.result) { const r = typeof x.result === 'string' ? JSON.parse(x.result) : x.result; sid = r.session.sessionId; send({ id: 2, method: 'session/subscribe', params: { sessionId: sid, deliveryKind: 'desktop-continuous', includeSnapshot: false } }); }
    if (x.id === 2 && !x.error && sid) send({ id: 3, method: 'session/send', params: { sessionId: sid, content: 'Remember the magic word BANANA-7. Reply with just OK.', inputId: 'turn1' } });
undefined
    if (x.method === 'v4/telemetry/event' && x.params?.kind === 'turn.terminal') {
      terminalCount++;
      if (terminalCount === 2) {
        const text = msgs.filter((m) => m.method === 'session/event' && m.params?.payload?.kind === 'text_delta').map((m) => m.params.payload.delta).join('');
        console.log(JSON.stringify({ probe: 'zcode-warm-same-session', sid_prefix: String(sid).slice(0, 8), turns: 2, same_process: true, text_tail: text.slice(-60) }));
        writeFileSync(resolve('.local/wc02-warm-probe/result.json'), JSON.stringify({ sameProcess: true, terminals: 2, answerTail: text.slice(-60) }) + '\n');
        child.kill();
        process.exit(0);
      }
      if (terminalCount === 1 && sid) send({ id: 5, method: 'session/send', params: { sessionId: sid, content: 'What was the magic word I told you? Reply with just the magic word.', inputId: 'turn2' } });
    }
    msgs.push(x);
  }
});
child.stderr.on('data', () => {});
await new Promise((r) => setTimeout(r, 1200));
send({ id: 1, method: 'session/create', params: { workspace: { workspacePath: home, workspaceKey: home } } });
await new Promise((r) => setTimeout(r, 90000));
console.log(JSON.stringify({ probe: 'zcode-warm-same-session', status: 'TIMEOUT', terminals: terminalCount }));
child.kill();
process.exit(1);
