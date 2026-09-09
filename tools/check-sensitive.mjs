import { createHash } from 'node:crypto';
import pathExceptions from '../packages/security/path-exceptions.json' with { type: 'json' };
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { scanText, forbiddenPath } from '../packages/security/scan.mjs';
const git = (args, input) => {
  const r = spawnSync(
    'git',
    ['-c', `safe.directory=${process.cwd().replaceAll('\\', '/')}`, ...args],
    { encoding: 'utf8', input, maxBuffer: 128 * 1024 * 1024, windowsHide: true },
  );
  if (r.status !== 0) throw Error('SCAN_INPUT_UNAVAILABLE');
  return r.stdout;
};
const findings = [];
let count = 0;
function inspect(name, bytes, pathGate = true) {
  count++;
  const rules = scanText(bytes.toString('utf8'));
  if (
    pathGate &&
    forbiddenPath(name) &&
    pathExceptions.files[name] !== createHash('sha256').update(bytes).digest('hex')
  )
    rules.push('FORBIDDEN_PATH');
  if (rules.length) findings.push({ file: name, rules });
}
if (process.argv.includes('--history')) {
  // 历史保留原提交，不因历史原始离线日志路径阻断；内容仍扫描。
  const lines = git(['rev-list', '--objects', '--all']).trim().split('\n');
  const ids = lines.map((l) => l.split(' ')[0]);
  const r = spawnSync(
    'git',
    ['-c', `safe.directory=${process.cwd().replaceAll('\\', '/')}`, 'cat-file', '--batch'],
    {
      input: ids.join('\n') + '\n',
      maxBuffer: 128 * 1024 * 1024,
      windowsHide: true,
    },
  );
  if (r.status !== 0) throw Error('SCAN_HISTORY_UNAVAILABLE');
  let offset = 0;
  for (const line of lines) {
    const end = r.stdout.indexOf(10, offset);
    const [, kind, size] = r.stdout.subarray(offset, end).toString().split(' ');
    offset = end + 1;
    const bytes = r.stdout.subarray(offset, offset + Number(size));
    offset += Number(size) + 1;
    if (kind === 'blob') inspect('history:' + line.split(' ')[0], bytes, false);
  }
} else if (process.argv.includes('--tree')) {
  const root = resolve(process.argv[process.argv.indexOf('--tree') + 1]);
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = resolve(dir, name),
        st = lstatSync(p);
      if (st.isSymbolicLink()) throw Error('SCAN_SYMLINK');
      if (st.isDirectory()) walk(p);
      else if (st.isFile()) inspect(relative(root, p).replaceAll('\\', '/'), readFileSync(p));
    }
  }
  walk(root);
} else {
  const list = git(['ls-files', '--stage', '-z']).split('\0').filter(Boolean);
  const entries = list.map((entry) => {
    const [meta, name] = entry.split('\t');
    const [, sha, stage] = meta.split(' ');
    if (stage !== '0') throw Error('UNMERGED_INDEX');
    return { sha, name };
  });
  const batch = spawnSync(
    'git',
    ['-c', `safe.directory=${process.cwd().replaceAll('\\', '/')}`, 'cat-file', '--batch'],
    {
      input: entries.map((e) => e.sha).join('\n') + '\n',
      maxBuffer: 128 * 1024 * 1024,
      windowsHide: true,
    },
  );
  if (batch.status !== 0) throw Error('SCAN_INDEX_UNAVAILABLE');
  let offset = 0;
  for (const entry of entries) {
    const end = batch.stdout.indexOf(10, offset);
    const [, kind, size] = batch.stdout.subarray(offset, end).toString().split(' ');
    if (kind !== 'blob') throw Error('SCAN_INDEX_TYPE');
    offset = end + 1;
    inspect(entry.name, batch.stdout.subarray(offset, offset + Number(size)));
    offset += Number(size) + 1;
  }
}
console.log(
  JSON.stringify({
    redacted: true,
    status: findings.length ? 'FAIL' : 'PASS',
    files: count,
    findings,
  }),
);
if (findings.length) process.exitCode = 1;
