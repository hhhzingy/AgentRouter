import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const base = 'docs/执行包/AgentRouter_V1.0功能与开发手册包';
for (const [src, dest] of [
  ['route.schema.json', 'packages/protocol/route.schema.json'],
  ['schema.sql', 'packages/storage/migrations/001-baseline.sql'],
  ['adapter-contract.d.ts', 'packages/protocol/adapter-contract.d.ts'],
  ['defaults.json', 'packages/protocol/defaults.json'],
])
  assert.equal(
    createHash('sha256')
      .update(readFileSync(`${base}/spec/${src}`))
      .digest('hex'),
    createHash('sha256').update(readFileSync(dest)).digest('hex'),
    `SPEC_CONFLICT:${dest}`,
  );
for (const file of readdirSync('packages/domain').filter((f) => f.endsWith('.ts'))) {
  const text = readFileSync(`packages/domain/${file}`, 'utf8');
  assert(
    !/from ['"].*(electron|adapters|runtime|storage)/.test(text),
    'DOMAIN_DEPENDENCY_DIRECTION',
  );
}
const pkg = JSON.parse(readFileSync('package.json'));
for (const version of Object.values({ ...pkg.dependencies, ...pkg.devDependencies }))
  assert(/^\d+\.\d+\.\d+/.test(version) && !/[~^*]|latest/.test(version), 'DEPENDENCY_NOT_PINNED');
console.log('PASS: 规范副本、领域依赖方向、直接依赖精确版本');
