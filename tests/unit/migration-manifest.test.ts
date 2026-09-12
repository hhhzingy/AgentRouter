import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const names = ['001-baseline.sql', '002-w11-application.sql', '003-native-execution.sql', '004-external-api-journal.sql'];
it('迁移文件保持LF且与manifest一致（跨checkout数据库兼容性守卫）', () => {
  const manifest = JSON.parse(readFileSync('docs/api/freeze.migrations.json', 'utf8'));
  expect(manifest.canonicalEol).toBe('LF');
  for (const name of names) {
    const bytes = readFileSync('packages/storage/migrations/' + name);
    expect(bytes.includes(13), name + ' 含CR字节').toBe(false);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(manifest.sha256_lf[name]);
  }
});
