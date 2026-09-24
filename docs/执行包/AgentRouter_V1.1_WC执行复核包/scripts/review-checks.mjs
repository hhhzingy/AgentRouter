// WC 执行复核包:非破坏性复核检查(不启动真实模型、不触碰生产数据)。
// 用法: node "docs/执行包/AgentRouter_V1.1_WC执行复核包/scripts/review-checks.mjs"
// 输出逐项 PASS/FAIL 与退出码;全部通过仅代表静态+单测层,不等于真实闭环认证。
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function vitest(args) {
  const r = spawnSync('node', ['node_modules/vitest/vitest.mjs', 'run', ...args], { encoding: 'utf8' });
  const raw = (r.stdout ?? '') + (r.stderr ?? '');
  const out = raw.replace(/\x1b\[[0-9;]*m/g, '');
  const line = out.split('\n').filter((l) => l.includes('Tests ')).join(' | ').trim();
  const green = r.status === 0 && /Tests\s+\d+ passed/.test(out) && !/failed/.test(line);
  if (!green) throw new Error('vitest not green: ' + (line || 'status=' + r.status).slice(0, 140));
  return out.match(/Tests\s+\d+ passed/)?.[0]?.replace(/\s+/g, ' ') ?? 'green';
}

const results = [];
const check = (name, fn) => {
  try {
    results.push({ name, verdict: 'PASS', detail: String(fn() ?? '') });
  } catch (e) {
    results.push({ name, verdict: 'FAIL', detail: String(e.message).slice(0, 160) });
  }
};

check('S1 SH-02 决策顺序(T≥S 无须 A) + SH-01 门控矩阵', () => vitest(['tests/unit/context-transfer-decide.test.ts', 'tests/unit/context-transfer.test.ts']));
check('S2 WC01 引擎闭环(fixture 端口)', () => vitest(['tests/integration/context-transfer-engine.test.ts']));
check('S3 WC02 连续性事实/不暗换/preflight', () => vitest(['tests/unit/wc02-continuity.test.ts']));
check('S4 WC04 ring 负测 + profile 工厂', () => vitest(['tests/unit/wc04-shared.test.ts']));
check('S5 W02/W-04/W-05 网关用例', () => vitest(['tests/integration/v11-remote-gateway.test.ts']));
check('S6 源码事实:inherit 门控不再有硬编码 false 且接真实通道', () => {
  const src = readFileSync(resolve('packages/core-service/role-session-extension.ts'), 'utf8');
  if (/inheritSupported\([^)]*,\s*false\s*\)/.test(src)) throw new Error('hardcoded false still present');
  if (!src.includes('sourceExportChannel: Boolean(ports')) throw new Error('gate not wired to ports');
  return 'role-session-extension gate verified';
});
check('S7 源码事实:zcode 不暗换 ref 守卫存在', () => {
  const src = readFileSync(resolve('packages/core-service/native-process-backend.ts'), 'utf8');
  if (!src.includes('SESSION_CONTINUATION_UNSUPPORTED') || !src.includes('continuityRefSaved')) throw new Error('guard missing');
  return 'backend guard verified';
});
check('S8 SC1 检查点在库且指向候选 SHA', () => {
  const j = JSON.parse(readFileSync(resolve('docs/parallel/shared-checkpoint.json'), 'utf8'));
  if (j.checkpoint !== 'SC1') throw new Error('not SC1');
  if (!/^[0-9a-f]{40}$/.test(String(j.candidate_source_sha))) throw new Error('no candidate sha');
  return 'SC1 ' + j.candidate_source_sha.slice(0, 12);
});
check('S9 旧 W12 卡已标注撤回', () => {
  const card = readFileSync(resolve('docs/reports/W12-user-action-card.md'), 'utf8');
  if (!card.includes('复核撤回')) throw new Error('withdrawal banner missing');
  return 'banner present';
});
check('S10 全量四套(较重,约2-4分钟)', () => vitest(['tests/integration', 'tests/unit', 'tests/contract', 'tests/chaos']));

for (const r of results) console.log(r.verdict.padEnd(5), r.name, r.detail ? '— ' + r.detail : '');
const failed = results.filter((r) => r.verdict === 'FAIL').length;
console.log(JSON.stringify({ passed: results.length - failed, failed }));
process.exitCode = failed ? 1 : 0;
