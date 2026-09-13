import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateExternalApiFrame, extensionReply, extensionErrorReply } from '../client-contract/external-api-1.ts';
import type Database from 'better-sqlite3';
/** participant.* 草案扩展(待CCR协商):参与者(网页/受管角色)把小型文本产物原子落盘到角色工作区。
 * 信任边界:落盘路径由 Core 从角色当前绑定的工作区推导,客户端只提供受限文件名与utf8内容;
 * 原子性:同目录临时文件+rename;完整性:sha256/byte_size 入库;下游:复用事件流与 artifact.list。 */
export interface ParticipantCallContext {
  principal: string;
  clientId?: string;
  mode?: string;
  /** Role-scoped 挂接断言:本连接必须持有该角色当前 generation,替代全局 Controller lease。 */
  assertParticipantAttachment: (roleId: string) => void;
}
const MIME: Record<string, string> = { '.md': 'text/markdown', '.json': 'application/json', '.txt': 'text/plain' };
export class ParticipantExtension {
  constructor(
    private readonly db: Database.Database,
    private readonly clock = () => Date.now(),
  ) {}
  handle(raw: unknown, context: ParticipantCallContext): unknown {
    try {
      const frame = validateExternalApiFrame(raw);
      if ((frame.method as string) !== 'participant.artifact') throw Error('UNSUPPORTED_METHOD');
      if (context.mode !== 'controller') throw Error('CONTROL_LEASE_REQUIRED');
      context.assertParticipantAttachment(String((frame.params as Record<string, unknown>)?.role_id ?? ''));
      const p = (frame.params ?? {}) as Record<string, unknown>;
      const roleId = String(p.role_id ?? '');
      const name = String(p.name ?? '');
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(name) || name.includes('..')) throw Error('PARTICIPANT_NAME_INVALID');
      const mediaType = MIME[name.slice(name.lastIndexOf('.')).toLowerCase()];
      if (!mediaType) throw Error('PARTICIPANT_TYPE_REJECTED');
      const content = p.content;
      if (typeof content !== 'string' || !content) throw Error('PARTICIPANT_CONTENT_INVALID');
      const bytes = Buffer.from(content, 'utf8');
      if (bytes.length > 262144) throw Error('PARTICIPANT_CONTENT_TOO_LARGE');
      const taskId = p.task_id === undefined ? null : String(p.task_id);
      const scopeRow = this.db
        .prepare('select r.*,s.project_id from roles r join spaces s on s.id=r.space_id where r.id=?')
        .get(roleId) as { id: string; project_id: string } | undefined;
      if (!scopeRow) throw Error('ROLE_NOT_FOUND');
      if (taskId !== null) {
        const t = this.db
          .prepare('select id from tasks where id=? and assignee_role_id=?')
          .get(taskId, roleId);
        if (!t) throw Error('TASK_SCOPE_DENIED');
      }
      const binding = this.db
        .prepare('select workspace_id from bindings where role_id=? and is_current=1')
        .get(roleId) as { workspace_id: string } | undefined;
      const workspace = binding
        ? (this.db.prepare('select canonical_path from workspaces where id=?').get(binding.workspace_id) as { canonical_path: string } | undefined)
            ?.canonical_path
        : undefined;
      if (!workspace) throw Error('WORKSPACE_SCOPE');
      const result = this.db.transaction(() => {
        const dir = resolve(workspace, 'agentrouter-artifacts');
        mkdirSync(dir, { recursive: true });
        const finalPath = join(dir, name);
        if (existsSync(finalPath)) throw Error('PARTICIPANT_NAME_TAKEN');
        const tempPath = join(dir, '.' + randomUUID() + '.tmp');
        writeFileSync(tempPath, bytes);
        renameSync(tempPath, finalPath);
        const sha = createHash('sha256').update(bytes).digest('hex');
        const id = 'artifact_' + randomUUID();
        this.db
          .prepare('insert into artifacts values(?,?,?,?,?,?,?,?,?)')
          .run(
            id,
            scopeRow.project_id,
            sha,
            sha,
            bytes.length,
            mediaType,
            JSON.stringify({ name, path: finalPath, role_id: roleId, ...(taskId ? { task_id: taskId } : {}), source: 'PARTICIPANT' }),
            'AVAILABLE',
            this.clock(),
          );
        this.db
          .prepare('insert into entity_revisions values(?,?,?) on conflict(entity_id) do update set revision=excluded.revision,updated_at_ms=excluded.updated_at_ms')
          .run(id, 0, this.clock());
        return { artifact_id: id, sha256: sha, byte_size: bytes.length, media_type: mediaType, name };
      }).immediate();
      return extensionReply(frame.id, result);
    } catch (error) {
      const rawId = (raw as { id?: unknown })?.id;
      return extensionErrorReply(typeof rawId === 'string' ? rawId : 'unknown', error);
    }
  }
}
