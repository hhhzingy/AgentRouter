import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const root = resolve('evidence/runs', runId);
mkdirSync(root, { recursive: true });
const commands = [
  ['spec', ['tools/spec-check.mjs']],
  ['lint', ['tools/lint.mjs']],
  ['typecheck', ['node_modules/typescript/bin/tsc', '--noEmit']],
  ...['unit', 'integration', 'contract', 'chaos'].map((kind) => [
    kind,
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      `tests/${kind}`,
      '--reporter=json',
      `--outputFile=${root}/${kind}.json`,
    ],
  ]),
  ['database', ['tools/db-verify.mjs']],
  ['windows-job', ['tools/test-supervisor.mjs']],
  ['build', ['tools/build-win.mjs']],
  ['packaged', ['tools/packaged-test.mjs']],
  ['electron-smoke', ['tools/desktop-smoke.mjs']],
  ['desktop', ['tools/desktop-test.mjs']],
];
const results = [];
for (const [name, args] of commands) {
  const start = new Date().toISOString();
  const result = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 90000,
    env: { ...process.env, TEMP: resolve('.local/tmp'), TMP: resolve('.local/tmp') },
  });
  const log = `$ ${process.execPath} ${args.join(' ')}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(resolve(root, name + '.log'), log);
  results.push({
    name,
    command: [process.execPath, ...args],
    started_at: start,
    exit_code: result.status,
    status: result.status === 0 ? 'PASS' : 'FAIL',
    error: result.error?.message,
    evidence: `evidence/runs/${runId}/${name}.log`,
  });
  console.log(name, results.at(-1).status);
}
const report = {
  run_id: runId,
  scope: '离线应用测试及开发机 Windows 探针；不计真实 Harness 支持',
  node: process.version,
  results,
};
writeFileSync(resolve(root, 'summary.json'), JSON.stringify(report, null, 2));
writeFileSync('evidence/latest-run.json', JSON.stringify(report, null, 2));
if (results.some((r) => r.status !== 'PASS')) process.exitCode = 1;
