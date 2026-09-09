import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
if (existsSync('compatibility-lock.json'))
  throw Error('ALREADY_INITIALIZED: refusing to overwrite records');
const base = 'docs/执行包/AgentRouter_V1.0功能与开发手册包';
const write = (p, text) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
};
const cases = JSON.parse(readFileSync(`${base}/spec/acceptance-cases.json`));
const manual = readFileSync(`${base}/01_功能手册.md`, 'utf8');
const modules = [
  'platform',
  'domain',
  'domain',
  'domain',
  'adapters',
  'adapters',
  'runtime',
  'protocol',
  'runtime',
  'runtime',
  'runtime',
  'runtime',
  'artifacts',
  'artifacts',
  'desktop',
  'desktop',
  'desktop',
  'accounts',
  'accounts',
  'accounts',
  'runtime',
  'platform',
  'storage',
  'storage',
  'role-bridge',
  'protocol',
];
const rows = [...manual.matchAll(/^\| (F\d\d) \| ([^|]+) \| ([^|]+) \|$/gm)].map((m, i) => {
  const linked = cases.filter((c) => c.features.includes(m[1]));
  return `| ${m[1]} | ${m[2].trim()} | ${modules[i]} | ${[...new Set(linked.map((c) => c.milestone))].sort().join(', ')} | ${linked.map((c) => c.id).join(', ')} | NOT_RUN |`;
});
write(
  'docs/implementation-plan.md',
  '# AgentRouter V1.0 实施计划与需求追踪\n\n原始开发包为冻结输入；功能 F01—F26 不删减。测试状态以 evidence 中实际执行记录为准。\n\n| 功能 | 名称 | 模块 | 阶段 | 测试 | 完整验收状态 |\n|---|---|---|---|---|---|\n' +
    rows.join('\n') +
    '\n\nM00 先建立版本、协议与打包探针；M01 完成协议/领域/数据库；M02 完成模拟调度/故障；M03—M05 按 Codex、Kimi、pi 接入真实协议；M06 工作区/产物/规则；M07 桌面/Windows 生命周期；M08 账号/备份；M09 完整发布验收。任何阶段的独立离线工作可以继续，但不得跨过失败依赖 Gate 宣告完成。\n',
);
write(
  'evidence/acceptance-status.json',
  JSON.stringify(
    cases.map((c) => ({ ...c, actual: null, exit_code: null, evidence: [], tested_at: null })),
    null,
    2,
  ) + '\n',
);
for (let i = 0; i < 10; i++) {
  const m = `M${String(i).padStart(2, '0')}`;
  write(
    `evidence/${m}/README.md`,
    `# ${m} 测试证据\n\n初始状态：NOT_RUN。证据必须记录命令、退出码、环境、实际结果、时间及范围。模拟数据不计真实 Harness 支持。\n`,
  );
}
write(
  'compatibility-lock.json',
  readFileSync(`${base}/templates/compatibility-lock.template.json`),
);
for (const [source, dest] of [
  ['route.schema.json', 'packages/protocol/route.schema.json'],
  ['adapter-contract.d.ts', 'packages/protocol/adapter-contract.d.ts'],
  ['defaults.json', 'packages/protocol/defaults.json'],
  ['schema.sql', 'packages/storage/migrations/001-baseline.sql'],
]) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(`${base}/spec/${source}`, dest);
}
for (const p of [
  'apps/desktop',
  'apps/core-daemon',
  'packages/protocol',
  'packages/domain',
  'packages/storage',
  'packages/runtime',
  'packages/adapters/codex',
  'packages/adapters/kimi',
  'packages/adapters/pi',
  'packages/role-bridge',
  'packages/pi-extension',
  'packages/artifacts',
  'packages/accounts',
  'packages/platform',
]) {
  write(
    `${p}/package.json`,
    JSON.stringify(
      {
        name: `@agentrouter/${p.replace('packages/', '').replace('apps/', '').replaceAll('/', '-')}`,
        version: '1.0.0-dev.0',
        private: true,
        type: 'module',
      },
      null,
      2,
    ) + '\n',
  );
}
