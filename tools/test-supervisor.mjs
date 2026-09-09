import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
  stdio: 'ignore',
  windowsHide: true,
});
const helper = spawn(
  resolve('.local/native/agentrouter-supervisor.exe'),
  [process.cwd(), process.execPath, resolve('tests/fixtures/process-tree.mjs')],
  { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
);
const report = {
  at: new Date().toISOString(),
  scope: 'M00 Windows Job Object 开发探针；非安装验收',
  status: 'FAIL',
};
try {
  const info = await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(Error('TIMEOUT')), 10000);
    helper.on('error', rej);
    helper.stderr.on('data', (b) => rej(Error(b.toString())));
    helper.stdout.once('data', (b) => {
      clearTimeout(timer);
      res(JSON.parse(b.toString()));
    });
  });
  helper.kill();
  await new Promise((r) => helper.once('close', r));
  await new Promise((r) => setTimeout(r, 300));
  const alive = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  assert(!alive(info.pid));
  assert(!alive(info.grandchild));
  assert(alive(unrelated.pid));
  Object.assign(report, {
    status: 'PASS',
    parentStopped: true,
    grandchildStopped: true,
    unrelatedPreserved: true,
    exit_code: 0,
  });
} catch (e) {
  Object.assign(report, { error: String(e), exit_code: 1 });
  process.exitCode = 1;
} finally {
  helper.kill();
  unrelated.kill();
  writeFileSync('evidence/M00/windows-job.json', JSON.stringify(report, null, 2) + '\n');
  console.log(report);
}
