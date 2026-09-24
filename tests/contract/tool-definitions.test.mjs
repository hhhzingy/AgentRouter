import { it, expect } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { toolDefinitions } from '../../packages/role-bridge/tool-definitions.mjs';
it('七工具 Schema 均可编译，注册范围不包含管理工具', () => {
  expect(toolDefinitions).toHaveLength(7);
  for (const t of toolDefinitions)
    expect(() => new Ajv2020({ strict: false }).compile(t.inputSchema)).not.toThrow();
  expect(toolDefinitions.some((t) => t.name === 'switch_account')).toBe(false);
  const finish = toolDefinitions.find((t) => t.name === 'route_finish');
  const write = toolDefinitions.find((t) => t.name === 'route_artifact_write');
  const read = toolDefinitions.find((t) => t.name === 'route_artifact_read');
  expect(finish.description).toContain('Required terminal submission');
  expect(write.description).toContain('does not complete the task');
  expect(write.description).toContain('route_finish');
  expect(write.description).toContain('response.reference');
  expect(read.description).toContain('route_finish');
});
