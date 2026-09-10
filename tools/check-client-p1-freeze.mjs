import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const staged = process.argv.includes('--staged');
function read(path) {
  if (!staged) return readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
  const r = spawnSync(
    'git',
    ['-c', `safe.directory=${process.cwd().replaceAll('\\', '/')}`, 'show', ':' + path],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true },
  );
  if (r.status !== 0) throw Error('FROZEN_INPUT_MISSING');
  return r.stdout.replaceAll('\r\n', '\n');
}
const manifest = JSON.parse(read('docs/api/freeze.c1r1p1.json'));
for (const [path, hash] of Object.entries(manifest.sha256_lf))
  if (createHash('sha256').update(read(path)).digest('hex') !== hash)
    throw Error('FROZEN_CONTRACT_CHANGED:' + path);
console.log('C1R1P1 frozen sources: PASS');
