import { it, expect } from 'vitest';
import { scanText } from '../../packages/security/scan.mjs';
import { diagnosticSummary } from '../../packages/security/diagnostics.mjs';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
it('G10-05 白名单日志丢弃凭据、用户路径、正文和异常，不依靠单一替换', () => {
  const canary = ['AR', 'CANARY', 'A'.repeat(20)].join('_');
  const output = diagnosticSummary({
    test: 'C1',
    status: 'PASS',
    exit_code: 0,
    event_count: 2,
    Authorization: canary,
    body: canary,
    error: canary,
    path: 'C:/Users/private/auth.json',
  });
  expect(output).toEqual({
    redacted: true,
    marker: 'REDACTED',
    test: 'C1',
    status: 'PASS',
    exit_code: 0,
    event_count: 2,
  });
  expect(JSON.stringify(output)).not.toContain(canary);
});
it('G10-06 Provider/Bearer/JWT/密钥字段/PEM/Cookie/canary 规则命中', () => {
  const values = [
    'sk' + '-' + 'a'.repeat(30),
    'Bearer ' + 'b'.repeat(30),
    'eyJ' + 'c'.repeat(12) + '.' + 'd'.repeat(12) + '.' + 'e'.repeat(12),
    'refresh' + '_token=' + 'f'.repeat(30),
    ['-----BEGIN', 'PRIVATE KEY-----'].join(' '),
    'Cookie=' + 'g'.repeat(30),
    ['AR', 'CANARY', 'H'.repeat(20)].join('_'),
  ];
  for (const value of values) expect(scanText(value).length).toBeGreaterThan(0);
});
it('G10-06 子进程扫描 Gate 对合成 canary 返回非零，输出无 canary 正文', () => {
  mkdirSync('.local/tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/tests/scan-'));
  const canary = ['AR', 'CANARY', 'J'.repeat(20)].join('_');
  writeFileSync(resolve(dir, 'fixture.txt'), canary);
  const r = spawnSync(process.execPath, ['tools/check-sensitive.mjs', '--tree', dir], {
    encoding: 'utf8',
  });
  expect(r.status).toBe(1);
  expect(r.stdout).toContain('CANARY');
  expect(r.stdout).not.toContain(canary);
});
it('G10-06 历史扫描覆盖发布 refs，但排除 Codex 本机 checkpoint refs', () => {
  mkdirSync('.local/tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/tests/history-scan-'));
  const scanner = resolve('tools/check-sensitive.mjs');
  const canary = ['AR', 'CANARY', 'K'.repeat(20)].join('_');
  const git = (args, input) => {
    const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8', input });
    expect(r.status, r.stderr).toBe(0);
    return r.stdout.trim();
  };
  try {
    git(['init', '-b', 'main']);
    git(['config', 'user.name', 'AgentRouter Test']);
    git(['config', 'user.email', 'agentrouter-test@example.invalid']);
    writeFileSync(resolve(dir, 'clean.txt'), 'clean');
    git(['add', 'clean.txt']);
    git(['commit', '-m', 'clean']);
    const base = git(['rev-parse', 'HEAD']);
    const blob = git(['hash-object', '-w', '--stdin'], canary);
    const tree = git(['mktree'], `100644 blob ${blob}\tleak.txt\n`);
    const leakCommit = git(['commit-tree', tree, '-p', base], 'local checkpoint\n');
    git(['update-ref', 'refs/codex/turn-diffs/test', leakCommit]);

    const privateOnly = spawnSync(
      process.execPath,
      [scanner, '--history'],
      { cwd: dir, encoding: 'utf8' },
    );
    expect(privateOnly.status, privateOnly.stderr).toBe(0);
    expect(privateOnly.stdout).not.toContain(canary);

    git(['update-ref', 'refs/heads/leak', leakCommit]);
    const published = spawnSync(process.execPath, [scanner, '--history'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(published.status).toBe(1);
    expect(published.stdout).toContain('CANARY');
    expect(published.stdout).not.toContain(canary);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
