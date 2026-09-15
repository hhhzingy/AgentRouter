import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type Database from 'better-sqlite3';

/** 远程设备身份与一次性配对。原始 challenge/token 只在签发瞬间返回一次;
 * 库中仅存 sha256 哈希。与本地 endpoint credential 完全分离。 */
export interface RemoteDevice {
  deviceId: string;
  displayName: string;
  kind: 'DESKTOP' | 'MOBILE';
  scope: string[];
  canRequestController: boolean;
  state: 'ACTIVE' | 'REVOKED';
  createdAtMs: number;
  lastSeenMs: number;
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const KINDS = new Set(['DESKTOP', 'MOBILE']);
function safeEqualHex(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function normalizeScope(scope: unknown): string[] {
  if (!Array.isArray(scope) || scope.length > 32 || !scope.every(s => typeof s === 'string' && /^[a-z][a-z0-9_.:-]{1,63}$/.test(s)))
    throw Error('REMOTE_SCOPE_INVALID');
  return [...new Set(scope)];
}
export class RemoteDeviceStore {
  constructor(private readonly db: Database.Database, private readonly clock = () => Date.now()) {}
  /** 本机 GUI 生成一次性配对挑战(5 分钟)。challenge 明文只此返回一次。 */
  createPairing(input: { displayName: string; kind: string; scope?: unknown; canRequestController?: unknown; ttlMs?: number }) {
    if (typeof input.displayName !== 'string' || !input.displayName.trim() || input.displayName.length > 80) throw Error('REMOTE_DISPLAY_NAME_INVALID');
    if (!KINDS.has(input.kind)) throw Error('REMOTE_KIND_INVALID');
    const scope = normalizeScope(input.scope ?? []);
    const canRequest = input.canRequestController === true;
    const ttl = Number.isSafeInteger(input.ttlMs) ? Math.min(Math.max(input.ttlMs!, 30_000), 15 * 60_000) : 5 * 60_000;
    const challenge = randomBytes(15).toString('base64url');
    const pairingId = 'rpair_' + randomBytes(12).toString('hex');
    const now = this.clock();
    this.db.prepare('insert into remote_pairings(pairing_id,challenge_hash,display_name,kind,scope_json,can_request_controller,state,created_at_ms,expires_at_ms) values(?,?,?,?,?,?,?,?,?)')
      .run(pairingId, hash(challenge), input.displayName.trim(), input.kind, JSON.stringify(scope), canRequest ? 1 : 0, 'PENDING', now, now + ttl);
    return { pairingId, challenge, expiresAtMs: now + ttl };
  }
  /** 远程端提交 challenge 换取长期凭据。单次使用;过期/已用/未知挑战拒绝。 */
  consumePairing(challenge: string, now = this.clock()) {
    if (typeof challenge !== 'string' || challenge.length < 12 || challenge.length > 128) throw Error('REMOTE_CHALLENGE_INVALID');
    return this.db.transaction(() => {
      const row = this.db.prepare('select * from remote_pairings where challenge_hash=?').get(hash(challenge)) as Record<string, unknown> | undefined;
      if (!row || row.state !== 'PENDING') throw Error('REMOTE_PAIRING_INVALID');
      if (Number(row.expires_at_ms) <= now) {
        this.db.prepare("update remote_pairings set state='EXPIRED' where pairing_id=?").run(row.pairing_id);
        throw Error('REMOTE_PAIRING_EXPIRED');
      }
      const deviceId = 'rdev_' + randomBytes(12).toString('hex');
      const token = randomBytes(32).toString('base64url');
      this.db.prepare('insert into remote_devices(device_id,display_name,kind,credential_hash,scope_json,can_request_controller,state,created_at_ms,last_seen_ms) values(?,?,?,?,?,?,?,?,?)')
        .run(deviceId, row.display_name, row.kind, hash(token), row.scope_json, row.can_request_controller, 'ACTIVE', now, now);
      this.db.prepare("update remote_pairings set state='CONSUMED', consumed_at_ms=?, device_id=? where pairing_id=?").run(now, deviceId, row.pairing_id);
      return { deviceId, token, scope: JSON.parse(row.scope_json as string) as string[], canRequestController: row.can_request_controller === 1, kind: row.kind as string, displayName: row.display_name as string };
    }).immediate();
  }
  /** 凭据认证:命中 ACTIVE 设备返回记录并刷新 last_seen;否则 null。 */
  authenticate(token: string, now = this.clock()): RemoteDevice | null {
    if (typeof token !== 'string' || token.length < 24 || token.length > 256) return null;
    const want = hash(token);
    const rows = this.db.prepare('select * from remote_devices').all() as Record<string, unknown>[];
    for (const r of rows) {
      if (safeEqualHex(String(r.credential_hash), want)) {
        if (r.state !== 'ACTIVE') return null;
        this.db.prepare('update remote_devices set last_seen_ms=? where device_id=?').run(now, r.device_id);
        return { deviceId: String(r.device_id), displayName: String(r.display_name), kind: r.kind as RemoteDevice['kind'], scope: JSON.parse(String(r.scope_json)), canRequestController: r.can_request_controller === 1, state: 'ACTIVE', createdAtMs: Number(r.created_at_ms), lastSeenMs: now };
      }
    }
    return null;
  }
  revoke(deviceId: string) {
    const now = this.clock();
    const info = this.db.prepare("update remote_devices set state='REVOKED', revoked_at_ms=? where device_id=? and state='ACTIVE'").run(now, deviceId);
    return info.changes === 1;
  }
  listDevices(): (RemoteDevice & { revokedAtMs: number | null })[] {
    return (this.db.prepare('select * from remote_devices order by created_at_ms').all() as Record<string, unknown>[]).map(r => ({
      deviceId: String(r.device_id), displayName: String(r.display_name), kind: r.kind as RemoteDevice['kind'],
      scope: JSON.parse(String(r.scope_json)) as string[], canRequestController: r.can_request_controller === 1,
      state: r.state as RemoteDevice['state'], createdAtMs: Number(r.created_at_ms), lastSeenMs: Number(r.last_seen_ms), revokedAtMs: r.revoked_at_ms === null ? null : Number(r.revoked_at_ms),
    }));
  }
}
