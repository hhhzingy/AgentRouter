import { it, expect } from 'vitest';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createFixture, request } from '../support.ts';
import { Management } from '../../packages/runtime/management.ts';
import { Core } from '../../packages/runtime/core.ts';
it('F02/F03/F04 真实目录登记、角色同名/改名/停用、归档保留源文件', () => {
  const f = createFixture();
  try {
    const m = new Management(f.db);
    const root = m.createProject('项目', f.dir);
    const a = m.createRole({
        spaceId: root.space,
        name: '同名',
        description: '职责',
        harness: 'codex',
        workspaceId: root.workspace,
      }),
      b = m.createRole({
        spaceId: root.space,
        name: '同名',
        description: '职责',
        harness: 'pi',
        workspaceId: root.workspace,
      });
    expect(a.role).not.toBe(b.role);
    m.renameRole(a.role, '改名');
    m.setRoleStatus(b.role, 'DISABLED');
    writeFileSync(resolve(f.dir, '用户源文件.txt'), '保留');
    m.archiveProject(root.project);
    expect(readFileSync(resolve(f.dir, '用户源文件.txt'), 'utf8')).toBe('保留');
  } finally {
    f.close();
  }
});
it('T002 未认证安装和 mock 都不能从生产调度入口执行', () => {
  const f = createFixture();
  try {
    f.core.send(f.core.management('role_a'), 'task', request('role_b'));
    expect(new Core(f.db).dispatch('role_b')).toBeNull();
    expect(f.core.tasks()[0].state).toBe('QUEUED');
  } finally {
    f.close();
  }
});
it('F08 项目规则发布保留旧修订且拒绝执行性内容', () => {
  const f = createFixture();
  try {
    const m = new Management(f.db);
    expect(
      m.publishPolicy('project_test', { fields: { review: { type: 'boolean', required: true } } })
        .revision,
    ).toBe(2);
    expect(() => m.publishPolicy('project_test', { script: 'evil' })).toThrow();
    expect((f.db.prepare('select count(*) as n from policies').get() as any).n).toBe(2);
  } finally {
    f.close();
  }
});
