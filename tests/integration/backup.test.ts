import { it, expect } from 'vitest';
import { resolve } from 'node:path';
import { createFixture, request } from '../support.ts';
import { backupStore, verifyBackup } from '../../packages/storage/backup.ts';
it('T068 在线备份恢复实际 SQLite 队列，非主文件复制', async () => {
  const f = createFixture();
  try {
    f.core.send(f.core.management('role_a'), 'backup', request('role_b'));
    const target = resolve(f.dir, 'backup');
    await backupStore(f.db, resolve(f.dir, 'artifacts'), target);
    expect(verifyBackup(target)).toEqual({
      status: 'PASS',
      artifacts: 0,
      accountReloginRequired: true,
    });
    expect(f.core.tasks()).toHaveLength(1);
  } finally {
    f.close();
  }
});
