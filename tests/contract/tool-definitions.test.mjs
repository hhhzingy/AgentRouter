import { it, expect } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { toolDefinitions } from '../../packages/role-bridge/tool-definitions.mjs';
it('七工具 Schema 均可编译，注册范围不包含管理工具', () => {
  expect(toolDefinitions).toHaveLength(7);
  for (const t of toolDefinitions)
    expect(() => new Ajv2020({ strict: false }).compile(t.inputSchema)).not.toThrow();
  expect(toolDefinitions.some((t) => t.name === 'switch_account')).toBe(false);
});
