import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
mkdirSync('.local/desktop-tests', { recursive: true });
const data = mkdtempSync(resolve('.local/desktop-tests/smoke-'));
const report = resolve('evidence/M00/electron-smoke.json');
const env = {
  ...process.env,
  AGENTROUTER_DATA: data,
  AGENTROUTER_SMOKE_REPORT: report,
  AGENTROUTER_SOFTWARE_RENDERING: '1',
  TEMP: data,
  TMP: data,
};
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(
  resolve('.local/native/agentrouter-supervisor.exe'),
  [process.cwd(), resolve('release/AgentRouter-preview/electron.exe'), `--user-data-dir=${data}`],
  { windowsHide: true, env, stdio: ['pipe', 'pipe', 'pipe'] },
);
child.stdout.on('data', () => {});
child.stderr.on('data', (b) => process.stderr.write(b));
const timer = setTimeout(() => {
  child.kill();
  process.exitCode = 1;
}, 20000);
child.on('error', (e) => {
  clearTimeout(timer);
  throw e;
});
const code = await new Promise((r) => child.on('close', r));
clearTimeout(timer);
if (!existsSync(report)) throw Error('DESKTOP_SMOKE_NO_REPORT');
const result = JSON.parse(readFileSync(report));
console.log(result);
if (code !== 0 || result.status !== 'PASS') process.exitCode = 1;
