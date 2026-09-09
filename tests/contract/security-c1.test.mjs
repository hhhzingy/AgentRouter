import { it, expect } from 'vitest';
import { scanText } from '../../packages/security/scan.mjs';
import { diagnosticSummary } from '../../packages/security/diagnostics.mjs';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
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
