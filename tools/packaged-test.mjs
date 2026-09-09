import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
mkdirSync('.local/packaged-tests', { recursive: true });
const data = mkdtempSync(resolve('.local/packaged-tests/中文 路径-'));
const runtime = resolve('release/AgentRouter-preview/resources/runtime/node.exe');
const core = resolve('release/AgentRouter-preview/resources/app/core.mjs');
const child = spawn(runtime, [core], {
  cwd: data,
  windowsHide: true,
  env: {
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    PATH: '',
    TEMP: data,
    TMP: data,
    AGENTROUTER_DATA: data,
  },
  stdio: ['pipe', 'pipe', 'pipe'],
});
const report = {
  at: new Date().toISOString(),
  scope: '开发机上 PATH 为空、私有 Node + 打包 Core/SQLite；非无开发工具目标机',
  status: 'FAIL',
  exit_code: 1,
};
try {
  const response = await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(Error('TIMEOUT')), 10000);
    child.on('error', rej);
    child.stderr.on('data', (b) => rej(Error('CHILD_DIAGNOSTIC')));
    child.stdout.once('data', (b) => {
      clearTimeout(timer);
      res(JSON.parse(b.toString()));
    });
    child.stdin.write('{"id":1,"method":"snapshot"}\n');
  });
  assert.equal(response.result.runtime.node, 'v24.14.0');
  assert.equal(response.result.runtime.sqlite, '3.53.4');
  child.stdin.write('{"id":2,"method":"shutdown"}\n');
  const code = await new Promise((r) => child.once('close', r));
  assert.equal(code, 0);
  Object.assign(report, {
    status: 'PASS',
    exit_code: 0,
    node: response.result.runtime.node,
    sqlite: response.result.runtime.sqlite,
  });
} catch (e) {
  Object.assign(report, { code: 'CHECK_FAILED', redacted: true });
  process.exitCode = 1;
} finally {
  child.kill();
  writeFileSync('evidence/M00/packaged-core.json', JSON.stringify(report, null, 2) + '\n');
  console.log(report);
}
