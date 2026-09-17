import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, renameSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
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
      const method = frame.method as string;
      if (!['participant.artifact', 'participant.inbox', 'participant.read_artifact'].includes(method))
        throw Error('UNSUPPORTED_METHOD');
      if (context.mode !== 'controller') throw Error('CONTROL_LEASE_REQUIRED');
      // WN03/MCP-03:读路径同样复验 grant/代次/撤销(不只写验证)。
      context.assertParticipantAttachment(String((frame.params as Record<string, unknown>)?.role_id ?? ''));
      const p = (frame.params ?? {}) as Record<string, unknown>;
      if (method === 'participant.inbox') return extensionReply(frame.id, this.inbox(String(p.role_id ?? '')));
      if (method === 'participant.read_artifact')
        return extensionReply(frame.id, this.readArtifact(String(p.role_id ?? ''), String(p.task_id ?? ''), String(p.artifact_id ?? '')));
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
      // WN03/MCP-04:稳定 request_key 幂等回执(同意图同键 → 原回执;异内容 → 冲突)。
      const requestKey = p.request_key === undefined ? null : String(p.request_key);
      if (requestKey !== null && !/^[A-Za-z0-9_.:-]{1,128}$/.test(requestKey)) throw Error('INVALID_PARAMS');
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
        if (requestKey) {
          const prior = this.db
            .prepare(
              "select id from artifacts where project_id=? and json_extract(source_json,'$.request_key')=?",
            )
            .get(scopeRow.project_id, requestKey) as { id: string } | undefined;
          if (prior) {
            const row = this.db
              .prepare('select source_json,sha256,byte_size,media_type from artifacts where id=?')
              .get(prior.id) as { source_json: string; sha256: string; byte_size: number; media_type: string };
            if (row.sha256 !== createHash('sha256').update(bytes).digest('hex'))
              throw Error('PARTICIPANT_REQUEST_CONFLICT');
            const meta = JSON.parse(row.source_json) as { name?: string };
            return {
              artifact_id: prior.id,
              sha256: row.sha256,
              byte_size: row.byte_size,
              media_type: row.media_type,
              name: meta.name ?? name,
              replayed: true,
            };
          }
        }
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
            JSON.stringify({ name, path: finalPath, role_id: roleId, ...(taskId ? { task_id: taskId } : {}), ...(requestKey ? { request_key: requestKey } : {}), source: 'PARTICIPANT' }),
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
  /** WN03:结构化任务收件箱(本角色):任务+状态+等待输入+结果发布态。 */
  private inbox(roleId: string) {
    const role = this.db
      .prepare('select r.id,s.project_id from roles r join spaces s on s.id=r.space_id where r.id=?')
      .get(roleId);
    if (!role) throw Error('ROLE_NOT_FOUND');
    const tasks = this.db
      .prepare(
        `select t.id,t.summary,t.state,
           (select count(*) from runs r where r.task_id=t.id and r.state='WAITING_INPUT') waiting,
           (select res.publication_state from results res where res.task_id=t.id) publication_state
         from tasks t where t.assignee_role_id=? order by t.created_at_ms desc limit 50`,
      )
      .all(roleId);
    return { role_id: roleId, tasks };
  }
  /** WN03/合同§5:只读任务引用的已登记 Artifact(版本=sha/bytes;不任意读盘)。 */
  private readArtifact(roleId: string, taskId: string, artifactId: string) {
    const role = this.db
      .prepare('select r.id,s.project_id from roles r join spaces s on s.id=r.space_id where r.id=?')
      .get(roleId) as { id: string; project_id: string } | undefined;
    if (!role) throw Error('ROLE_NOT_FOUND');
    const task = this.db
      .prepare('select id from tasks where id=? and assignee_role_id=?')
      .get(taskId, roleId);
    if (!task) throw Error('TASK_SCOPE_DENIED');
    const row = this.db
      .prepare('select state,source_json,sha256,byte_size,media_type,created_at_ms from artifacts where id=?')
      .get(artifactId) as
      | { state: string; source_json: string; sha256: string; byte_size: number; media_type: string; created_at_ms: number }
      | undefined;
    if (!row) throw Error('ARTIFACT_NOT_FOUND');
    const meta = JSON.parse(row.source_json) as { path?: string; task_id?: string; project_id?: string };
    const artifactProject = this.db
      .prepare('select project_id from artifacts where id=?')
      .get(artifactId) as { project_id: string } | undefined;
    if (!artifactProject || artifactProject.project_id !== role.project_id) throw Error('TASK_SCOPE_DENIED');
    if (meta.task_id !== taskId && meta.task_id !== undefined) throw Error('TASK_SCOPE_DENIED');
    if (row.state !== 'AVAILABLE') throw Error('ARTIFACT_NOT_READABLE');
    if (!meta.path || !existsSync(meta.path)) throw Error('ARTIFACT_FILE_MISSING');
    const bytes = readFileSync(meta.path);
    if (bytes.length !== row.byte_size || createHash('sha256').update(bytes).digest('hex') !== row.sha256)
      throw Error('ARTIFACT_CHECKSUM_FAILED');
    return {
      artifact_id: artifactId,
      name: (meta as { name?: string }).name ?? null,
      sha256: row.sha256,
      byte_size: row.byte_size,
      media_type: row.media_type,
      version: row.created_at_ms,
      content: bytes.toString('utf8'),
    };
  }
}
