import { it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { inspectArtifact } from '../../packages/core-service/artifacts.ts';
import { artifactBlobHash, resolveArtifactBlobPath } from '../../packages/artifacts/index.ts';
import { assertManagementLauncher } from '../../apps/management-mcp/launcher-guard.ts';

it('F01: ZCode initializeTarget 必须 await session/send，不得 void .catch 假 confirmed', () => {
  const src = readFileSync('packages/platform/zcode-context-port.ts', 'utf8');
  expect(src).not.toMatch(/void\s+[^\n;]*\.catch\s*\(/);
  expect(src).toMatch(/await c\.request\(\s*'session\/send'/);
  expect(src).toMatch(/send 受理后才返回/);
});

it('F04: inspectArtifact 认 projectId/hash、纯 hash，并落到 artifacts/<hash>', () => {
  mkdirSync('.local/w11-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/w11-tests/art-inspect-'));
  const body = Buffer.from('hello-artifact');
  const hash = createHash('sha256').update(body).digest('hex');
  mkdirSync(resolve(dir, 'artifacts'), { recursive: true });
  writeFileSync(resolve(dir, 'artifacts', hash), body);
  const dbName = resolve(dir, 'core.db');
  expect(artifactBlobHash('project_abc123/' + hash)).toBe(hash);
  expect(artifactBlobHash(hash)).toBe(hash);
  expect(resolveArtifactBlobPath(resolve(dir, 'artifacts'), 'project_abc123/' + hash)).toBe(
    resolve(dir, 'artifacts', hash),
  );
  const prefixed = inspectArtifact(
    dbName,
    {
      id: 'artifact_1',
      storage_key: 'project_abc123/' + hash,
      byte_size: body.length,
      sha256: hash,
      state: 'AVAILABLE',
      media_type: 'text/plain',
      source_json: JSON.stringify({ name: 'note.txt' }),
      created_at_ms: 1,
    },
    3,
  );
  expect(prefixed.view.state).toBe('AVAILABLE');
  expect(prefixed.bytes?.toString()).toBe('hello-artifact');
  const hashed = inspectArtifact(
    dbName,
    {
      id: 'artifact_2',
      storage_key: hash,
      byte_size: body.length,
      sha256: hash,
      state: 'AVAILABLE',
      media_type: 'text/plain',
      source_json: JSON.stringify({ name: 'note.txt' }),
      created_at_ms: 1,
    },
    3,
  );
  expect(hashed.view.state).toBe('AVAILABLE');
});

it('C1: mcp_management_cursor 允许启动；Cursor 不得作为 Role', () => {
  expect(() =>
    assertManagementLauncher({ data: 'E:/dut', mode: 'observer', clientId: 'mcp_management_cursor' }),
  ).not.toThrow();
  expect(() =>
    assertManagementLauncher({
      data: 'E:/dut',
      mode: 'controller',
      clientId: 'mcp_management_cursor',
    }),
  ).not.toThrow();
  expect(() =>
    assertManagementLauncher({
      data: 'E:/dut',
      mode: 'observer',
      clientId: 'mcp_management_cursor',
      managedRole: '1',
    }),
  ).toThrow('MANAGEMENT_START_DENIED');
  expect(() =>
    assertManagementLauncher({ data: 'E:/dut', mode: 'observer', clientId: 'cursor' }),
  ).toThrow('MANAGEMENT_START_DENIED');
});

it.each(['mcp_management_codex', 'mcp_management_zcode'])(
  'N5: %s 仅作为通用 Management Client 通过启动门禁',
  (clientId) => {
    expect(() =>
      assertManagementLauncher({
        data: 'E:/dut',
        mode: 'observer',
        clientId,
      }),
    ).not.toThrow();
    expect(() =>
      assertManagementLauncher({
        data: 'E:/dut',
        mode: 'controller',
        clientId,
      }),
    ).not.toThrow();
    expect(() =>
      assertManagementLauncher({
        data: 'E:/dut',
        mode: 'controller',
        clientId,
        managedRole: '1',
      }),
    ).toThrow('MANAGEMENT_START_DENIED');
  },
);
