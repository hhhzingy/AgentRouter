import { extensionReply, extensionErrorReply } from '../client-contract/external-api-1.ts';
import type { RemoteDeviceStore } from './device-store.ts';

export interface RemoteDeviceExtensionContext {
  principal: string;
  mode?: string;
}

/** W09:本机受信任 GUI 经 Core 生成/管理远程设备配对。仅非远程连接可调用;
 * 远程设备连接(principal=remote_device_*)绝不许自我配对(防权限升级)。 */
export class RemoteDeviceExtension {
  constructor(
    private readonly store: RemoteDeviceStore,
    private readonly hooks?: { onRevoke?: (deviceId: string) => void },
  ) {}
  handle(raw: unknown, ctx: RemoteDeviceExtensionContext): unknown {
    const frame = raw as { id?: unknown; method?: unknown; params?: Record<string, unknown> };
    const id = typeof frame.id === 'string' ? frame.id : 'ext';
    try {
      if (ctx.principal.startsWith('remote_device_')) throw Object.assign(new Error('SCOPE_DENIED'));
      const method = String(frame.method);
      const p = (frame.params ?? {}) as Record<string, unknown>;
      if (method === 'remoteDevice.createPairing') {
        const name = String(p.displayName ?? '').trim();
        if (!name || name.length > 80) throw Object.assign(new Error('INVALID_PARAMS'));
        if (p.kind !== 'DESKTOP' && p.kind !== 'MOBILE') throw Object.assign(new Error('INVALID_PARAMS'));
        if (p.scope !== undefined && !Array.isArray(p.scope)) throw Object.assign(new Error('INVALID_PARAMS'));
        const ttl = p.ttlMs === undefined ? undefined : Number(p.ttlMs);
        if (ttl !== undefined && (!Number.isFinite(ttl) || ttl < 30_000 || ttl > 600_000))
          throw Object.assign(new Error('INVALID_PARAMS'));
        const r = this.store.createPairing({
          displayName: name,
          kind: p.kind,
          canRequestController: p.canRequestController === true,
          ...(Array.isArray(p.scope) ? { scope: p.scope.map(String) } : {}),
          ...(ttl !== undefined ? { ttlMs: ttl } : {}),
        });
        return extensionReply(id, r);
      }
      if (method === 'remoteDevice.listDevices')
        return extensionReply(id, { devices: this.store.listDevices() });
      if (method === 'remoteDevice.revoke') {
        const deviceId = String(p.deviceId ?? '');
        if (!deviceId) throw Object.assign(new Error('INVALID_PARAMS'));
        const revoked = this.store.revoke(deviceId) === true;
        if (revoked) this.hooks?.onRevoke?.(deviceId);
        return extensionReply(id, { revoked });
      }
      throw Object.assign(new Error('METHOD_NOT_ALLOWED'));
    } catch (error) {
      return extensionErrorReply(id, error);
    }
  }
}
