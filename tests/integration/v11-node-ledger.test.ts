import { it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RemoteNodeLedger, type SafeStorageLike } from '../../packages/remote/node-ledger.ts';

// 测试用可逆 fake safeStorage(XOR+base64 风格,仅证明"加密态落盘、明文不经 renderer")。
const fakeSafe: SafeStorageLike = {
  isEncryptionAvailable: () => true,
  encryptString: (p: string) => Buffer.from(p.split('').map((c, i) => c.charCodeAt(0) ^ ((i % 12) + 1))),
  decryptString: (b: Buffer) => Buffer.from([...b].map((c, i) => c ^ ((i % 12) + 1))).toString('utf8'),
};
function temp() {
  const dir = mkdtempSync(join(tmpdir(), 'ar-node-'));
  return { dir, ledger: new RemoteNodeLedger(dir, fakeSafe) };
}
const devId = 'rdev_' + 'ab'.repeat(12);
const tok = 'T'.repeat(40);

it('登记节点:元数据明文、token 加密落盘且 renderer 文件不含明文', () => {
  const { dir, ledger } = temp();
  const node = ledger.add({ name: 'PC-A', url: 'https://young-lab.ts:4443', deviceId: devId, token: tok });
  expect(node.url).toBe('https://young-lab.ts:4443');
  expect(ledger.list()).toHaveLength(1);
  expect(ledger.list()[0]).toMatchObject({ name: 'PC-A', hasCredential: true });
  // 磁盘不得出现明文 token
  const read = (require('node:fs') as typeof import('node:fs')).readFileSync(join(dir, 'remote-tokens.bin'), 'utf8');
  expect(read.includes(tok)).toBe(false);
  // Main 侧可解密取回
  expect(ledger.credentialFor(node.id)).toBe(tok);
  rmSync(dir, { recursive: true, force: true });
});

it('非法 url/设备 id/短 token 拒绝;remove 清除元数据与凭据;未知节点 credentialFor null', () => {
  const { dir, ledger } = temp();
  expect(() => ledger.add({ name: 'x', url: 'notaurl', deviceId: devId, token: tok })).toThrow('REMOTE_NODE_URL_INVALID');
  expect(() => ledger.add({ name: 'x', url: 'https://h', deviceId: 'bad', token: tok })).toThrow('REMOTE_DEVICE_ID_INVALID');
  expect(() => ledger.add({ name: 'x', url: 'https://h', deviceId: devId, token: 'short' })).toThrow('REMOTE_TOKEN_INVALID');
  const n = ledger.add({ name: 'x', url: 'http://h:80', deviceId: devId, token: tok });
  expect(ledger.credentialFor('rnode_missing')).toBeNull();
  ledger.remove(n.id);
  expect(ledger.list()).toHaveLength(0);
  expect(ledger.credentialFor(n.id)).toBeNull();
  rmSync(dir, { recursive: true, force: true });
});

it('safeStorage 不可用时拒绝登记(不降级明文存储)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ar-node-nosafe-'));
  const ledger = new RemoteNodeLedger(dir, { isEncryptionAvailable: () => false, encryptString: () => Buffer.alloc(0), decryptString: () => '' });
  expect(() => ledger.add({ name: 'x', url: 'https://h', deviceId: devId, token: tok })).toThrow('SAFE_STORAGE_UNAVAILABLE');
  rmSync(dir, { recursive: true, force: true });
});
