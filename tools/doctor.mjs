import { redactLocation } from '../packages/security/diagnostics.mjs';
import { piEntry } from './pi-location.mjs';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import os from 'node:os';
const run = (file, args) => {
  const r = spawnSync(file, args, { encoding: 'utf8', timeout: 15000, windowsHide: true });
  return {
    exit_code: r.status,
    stdout: r.stdout?.trim(),
    stderr: r.stderr?.trim(),
    error: r.error?.code,
  };
};
const which = (name) => {
  const r = run('where.exe', [name]);
  return r.exit_code === 0 ? r.stdout.split(/\r?\n/)[0] : null;
};
const hash = (p) =>
  p && existsSync(p) ? createHash('sha256').update(readFileSync(p)).digest('hex') : null;
const lock = JSON.parse(readFileSync('compatibility-lock.json', 'utf8'));
const entries = [
  ['codex', which('codex.exe'), ['--version']],
  ['kimi_code', which('kimi.exe'), ['--version']],
  ['pi', piEntry(), ['--version']],
];
const report = {
  at: new Date().toISOString(),
  scope: '无模型调用、无凭据读取的版本检测',
  os: { platform: os.platform(), arch: os.arch(), release: os.release() },
  node: { path: process.execPath, version: process.version, sha256: hash(process.execPath) },
  git: run('git', ['--version']),
  harnesses: [],
};
for (const [id, p, args] of entries) {
  const r = p
    ? run(id === 'pi' ? process.execPath : p, id === 'pi' ? [p, ...args] : args)
    : { exit_code: null, error: 'NOT_INSTALLED' };
  report.harnesses.push({ id, path: p, sha256: hash(p), ...r });
  Object.assign(
    lock.harnesses.find((h) => h.id === id),
    {
      binary_path: p,
      sha256: hash(p),
      version: r.exit_code === 0 ? r.stdout : null,
      status: r.exit_code === 0 ? 'PROBED' : 'BLOCKED_ENV',
      evidence: ['evidence/M00/environment.json'],
    },
  );
}
lock.runtime.node = report.node;
lock.runtime.windows_build = os.release();
mkdirSync('evidence/M00', { recursive: true });
mkdirSync('.local', { recursive: true });
writeFileSync('.local/runtime-locations.json', JSON.stringify(lock, null, 2));
const safe = JSON.parse(JSON.stringify(lock, (_key, value) => redactLocation(value)));
writeFileSync(
  'evidence/M00/environment.json',
  JSON.stringify(
    { redacted: true, os: report.os, node: safe.runtime.node, harnesses: safe.harnesses },
    null,
    2,
  ),
);
writeFileSync('compatibility-lock.json', JSON.stringify(safe, null, 2) + '\n');
console.log(
  JSON.stringify({ redacted: true, status: 'PASS', harness_count: report.harnesses.length }),
);
