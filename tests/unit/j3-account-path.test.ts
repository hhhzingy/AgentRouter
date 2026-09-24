import { it, expect } from 'vitest';
// @ts-expect-error JavaScript scanner has no declaration file.
import { forbiddenPath } from '../../packages/security/scan.mjs';
it('账号材料目录不依赖文件名、扩展名或 Key 前缀，全部禁止进入 Git', () => {
  for (const path of ['账号信息/通用API/百炼.txt', '账号信息/codex/auth.json', '账号信息/kimi/profile.dat', 'nested/账号信息/anything.txt', '账号信息\\通用API\\Deepseek.txt']) expect(forbiddenPath(path)).toBe(true);
  expect(forbiddenPath('docs/j3/account-debug.md')).toBe(false);
});
