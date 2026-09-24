import { diagnosticSummary } from '../packages/security/diagnostics.mjs';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const root = resolve('evidence/runs', runId);
mkdirSync(root, { recursive: true });
const resultRoot = resolve('.local/verification', runId);
mkdirSync(resultRoot, { recursive: true });
const commands = [
  ['spec', ['tools/spec-check.mjs']],
  ['c1-drift', ['tools/generate-client-contract.mjs', '--check']],
  ['lint', ['tools/lint.mjs']],
  ['typecheck', ['node_modules/typescript/bin/tsc', '--noEmit']],
  ...['unit', 'integration', 'contract', 'chaos'].map((kind) => [
    kind,
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      `tests/${kind}`,
      '--reporter=json',
      `--outputFile=${resultRoot}/${kind}.json`,
    ],
  ]),
  ['database', ['tools/db-verify.mjs']],
  ['windows-job', ['tools/test-supervisor.mjs']],
  ['build', ['tools/build-win.mjs']],
  ['packaged', ['tools/packaged-test.mjs']],
  ['electron-smoke', ['tools/desktop-smoke.mjs']],
  ['desktop', ['tools/desktop-test.mjs']],
  ['c1-preload', ['tools/test-c1-desktop.mjs']],
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
  let tests = {};
  let reportMissing = false;
  try {
    const parsed = JSON.parse(readFileSync(resolve(resultRoot, name + '.json'), 'utf8'));
    tests = {
      test_count: parsed.numTotalTests,
      passed_count: parsed.numPassedTests,
      failed_count: parsed.numFailedTests,
    };
  } catch {
    reportMissing = ['unit', 'integration', 'contract', 'chaos'].includes(name);
  }
  const summary = diagnosticSummary({
    test: name.toUpperCase().replaceAll('-', '_'),
    at: start,
    exit_code: result.status,
    status: result.status === 0 && !reportMissing ? 'PASS' : 'FAIL',
    ...tests,
  });
  writeFileSync(resolve(root, name + '.json'), JSON.stringify(summary, null, 2));
  results.push({
    name,
    status: summary.status,
    exit_code: result.status,
    redacted: true,
    evidence: `evidence/runs/${runId}/${name}.json`,
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
