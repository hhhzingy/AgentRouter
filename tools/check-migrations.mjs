import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const staged = process.argv.includes('--staged');
function read(path) {
  if (!staged) return readFileSync(path);
  const r = spawnSync('git', ['-c', `safe.directory=${process.cwd().replaceAll('\\', '/')}`, 'show', ':' + path], {
    encoding: 'buffer', maxBuffer: 16 * 1024 * 1024, windowsHide: true,
  });
  if (r.status !== 0) throw Error('MIGRATION_INPUT_MISSING');
  return r.stdout;
}
import { spawnSync } from 'node:child_process';
const names = ['001-baseline.sql', '002-w11-application.sql', '003-native-execution.sql', '004-external-api-journal.sql'];
const manifestPath = 'docs/api/freeze.migrations.json';
// --write 仅用于首次生成或显式重生成 manifest；CI/门禁一律校验。
if (process.argv.includes('--write')) {
  const manifest = {
    canonicalEol: 'LF',
    note: '迁移校验和按文件字节计算；工作树必须与 .gitattributes 的 LF 一致，否则跨 checkout 的 Core 会按设计拒绝彼此的数据库。',
    sha256_lf: Object.fromEntries(
      names.map((n) => [n, createHash('sha256').update(read('packages/storage/migrations/' + n)).digest('hex')]),
    ),
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log('migration manifest written');
  process.exit(0);
}
if (!existsSync(manifestPath)) throw Error('MIGRATION_MANIFEST_MISSING');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
for (const name of names) {
  const bytes = read('packages/storage/migrations/' + name);
  if (bytes.includes(13)) throw Error('MIGRATION_EOL_NOT_LF:' + name);
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (manifest.sha256_lf[name] !== actual) throw Error('MIGRATION_MANIFEST_MISMATCH:' + name);
}
console.log('migration manifest + EOL guard: PASS');
