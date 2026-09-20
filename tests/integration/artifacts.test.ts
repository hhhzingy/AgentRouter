import { it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { freezeFile, containedPath } from '../../packages/artifacts/index.ts';
it('T039 冻结后原始文件覆盖不影响结果', () => {
  mkdirSync('.local/tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/tests/artifact-'));
  writeFileSync(resolve(dir, '报告.txt'), '第一版');
  const a = freezeFile(dir, '报告.txt', resolve(dir, 'objects'));
  writeFileSync(resolve(dir, '报告.txt'), '第二版');
  expect(readFileSync(resolve(dir, 'objects', a.storage_key), 'utf8')).toBe('第一版');
});
it('T042 路径越界、ADS 和设备名拒绝', () => {
  for (const p of ['../auth.json', 'C:\\auth.json', 'file:secret', 'NUL'])
    expect(() => containedPath(process.cwd(), p)).toThrow();
});

import { createFixture, request, finish } from '../support.ts';
it('F14 完整注册/重复/读取/结果发布，缺失内容不允许交付', () => {
  const f = createFixture();
  try {
    writeFileSync(resolve(f.dir, 'result.txt'), '冻结版本');
    f.core.send(f.core.management('role_a'), 'root', request('role_b'));
    const b = f.dispatch('role_b')!;
    const artifact = f.core.registerArtifact(b.principal, 'artifact', {
      workspace_id: 'workspace_b',
      path: 'result.txt',
    });
    expect(
      f.core.registerArtifact(b.principal, 'artifact2', {
        workspace_id: 'workspace_b',
        path: 'result.txt',
      }).artifact_id,
    ).toBe(artifact.artifact_id);
    writeFileSync(resolve(f.dir, 'result.txt'), '后续变化');
    const read = f.core.readArtifact(b.principal, {
      reference: { kind: 'artifact', artifact_id: artifact.artifact_id },
    });
    expect(Buffer.from(read.content, 'base64').toString()).toBe('冻结版本');
    f.core.finish(b.principal, 'finish', {
      ...finish(),
      outputs: [{ kind: 'artifact', artifact_id: artifact.artifact_id }],
    });
    f.core.settle(b.id, 1, 'succeeded', { native: true, resourcesStopped: true });
    expect(f.core.inbox()).toHaveLength(1);
  } finally {
    f.close();
  }
});

it('受管 Role 只在当前 workspace 写入小型 UTF-8 Artifact，并以 operation 幂等冻结', () => {
  const f = createFixture();
  try {
    f.core.send(f.core.management('role_a'), 'root-write', request('role_b'));
    const b = f.dispatch('role_b')!;
    const input = {
      workspace_id: 'workspace_b',
      name: 'review.md',
      content: '# Review\nPASS\n',
      media_type: 'text/markdown',
    };
    const first = f.core.writeArtifact(b.principal, 'write-artifact', input);
    expect(f.core.writeArtifact(b.principal, 'write-artifact', input)).toEqual(first);
    expect(readFileSync(resolve(f.dir, 'agentrouter-artifacts', 'review.md'), 'utf8')).toBe(input.content);
    const read = f.core.readArtifact(b.principal, {
      reference: { kind: 'artifact', artifact_id: first.artifact_id },
    });
    expect(Buffer.from(read.content, 'base64').toString()).toBe(input.content);
    expect(() => f.core.writeArtifact(b.principal, 'bad-scope', { ...input, workspace_id: 'workspace_a' })).toThrow('WORKSPACE_SCOPE');
    expect(() => f.core.writeArtifact(b.principal, 'bad-name', { ...input, name: '../escape.md' })).toThrow('ARTIFACT_NAME_INVALID');
  } finally {
    f.close();
  }
});
