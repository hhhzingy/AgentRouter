import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface RemoteNodeRecord {
  id: string;
  name: string;
  url: string; // https://host (gateway origin)
  deviceId: string;
  addedAtMs: number;
  lastSeenMs: number;
}
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(buf: Buffer): string;
}
/** REMOTE_CORE 节点账本:非秘密元数据(节点名/url/deviceId)明文存;设备 token 经 Electron safeStorage
 * (OS 密钥库)加密后单独存。Renderer 永不经手 token——只有 Main 读取用于建立 RemoteWebSocketTransport。 */
export class RemoteNodeLedger {
  private nodesFile: string;
  private tokensFile: string;
  constructor(private readonly dir: string, private readonly safe: SafeStorageLike, private readonly clock = () => Date.now()) {
    this.nodesFile = join(dir, 'remote-nodes.json');
    this.tokensFile = join(dir, 'remote-tokens.bin');
  }
  private loadNodes(): RemoteNodeRecord[] {
    if (!existsSync(this.nodesFile)) return [];
    try {
      const parsed = JSON.parse(readFileSync(this.nodesFile, 'utf8'));
      return Array.isArray(parsed) ? parsed.filter(n => n && typeof n.id === 'string' && typeof n.url === 'string' && /^https?:\/\//.test(n.url)) : [];
    } catch { return []; }
  }
  private saveNodes(nodes: RemoteNodeRecord[]) {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.nodesFile, JSON.stringify(nodes, null, 2), { mode: 0o600 });
  }
  private loadTokens(): Record<string, Buffer> {
    if (!existsSync(this.tokensFile)) return {};
    try { return JSON.parse(readFileSync(this.tokensFile, 'utf8'), (_k, v) => typeof v === 'string' ? Buffer.from(v, 'base64') : v); } catch { return {}; }
  }
  private saveTokens(t: Record<string, Buffer>) {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.tokensFile, JSON.stringify(Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.toString('base64')]))), { mode: 0o600 });
  }
  list(): (RemoteNodeRecord & { hasCredential: boolean })[] {
    const tokens = this.loadTokens();
    return this.loadNodes().map(n => ({ ...n, hasCredential: !!tokens[n.id] }));
  }
  /** 配对成功(设备 token 一次性返回)后登记节点。 */
  add(input: { name: string; url: string; deviceId: string; token: string }): RemoteNodeRecord {
    if (!input.name?.trim() || input.name.length > 80) throw Error('REMOTE_NODE_NAME_INVALID');
    let u: URL; try { u = new URL(input.url); } catch { throw Error('REMOTE_NODE_URL_INVALID'); }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw Error('REMOTE_NODE_URL_INVALID');
    if (!input.deviceId || !/^rdev_[a-f0-9]+$/.test(input.deviceId)) throw Error('REMOTE_DEVICE_ID_INVALID');
    if (typeof input.token !== 'string' || input.token.length < 24) throw Error('REMOTE_TOKEN_INVALID');
    if (!this.safe.isEncryptionAvailable()) throw Error('SAFE_STORAGE_UNAVAILABLE');
    const id = 'rnode_' + randomUUID();
    const now = this.clock();
    const record: RemoteNodeRecord = { id, name: input.name.trim(), url: u.origin, deviceId: input.deviceId, addedAtMs: now, lastSeenMs: now };
    this.saveNodes([...this.loadNodes(), record]);
    const tokens = this.loadTokens();
    tokens[id] = this.safe.encryptString(input.token);
    this.saveTokens(tokens);
    return record;
  }
  /** Main 建立 transport 时取解密 token;Renderer 不可调用此路径。 */
  credentialFor(nodeId: string): string | null {
    const t = this.loadTokens()[nodeId];
    if (!t) return null;
    try { return this.safe.decryptString(t); } catch { return null; }
  }
  markSeen(nodeId: string) {
    const nodes = this.loadNodes(); const n = nodes.find(x => x.id === nodeId); if (!n) return;
    n.lastSeenMs = this.clock(); this.saveNodes(nodes);
  }
  remove(nodeId: string) {
    this.saveNodes(this.loadNodes().filter(n => n.id !== nodeId));
    const tokens = this.loadTokens(); if (tokens[nodeId]) { delete tokens[nodeId]; this.saveTokens(tokens); }
  }
}
