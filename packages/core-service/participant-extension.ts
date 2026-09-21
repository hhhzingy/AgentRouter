import { createHash, randomUUID } from 'node:crypto';
import {
  mkdirSync,
  renameSync,
  writeFileSync,
  existsSync,
  readFileSync,
  unlinkSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import {
  validateExternalApiFrame,
  extensionReply,
  extensionErrorReply,
} from '../client-contract/external-api-1.ts';
import type Database from 'better-sqlite3';
/** participant.* 草案扩展(待CCR协商):参与者(网页/受管角色)把小型文本产物原子落盘到角色工作区。
 * 信任边界:落盘路径由 Core 从角色当前绑定的工作区推导,客户端只提供受限文件名与utf8内容;
 * 原子性:同目录临时文件+rename;完整性:sha256/byte_size 入库;下游:复用事件流与 artifact.list。
 * WN05 后续环:claim/request_user_input/submit_result 为外接角色的真实工作环 —
 * 任务状态走与原生相同的 domain 迁移,结果以 run_id=NULL 直发(016),人类验收(result.accept)不变。 */
export interface ParticipantCallContext {
  principal: string;
  clientId?: string;
  mode?: string;
  /** Role-scoped 挂接断言:本连接必须持有该角色当前 generation,替代全局 Controller lease。 */
  assertParticipantAttachment: (roleId: string) => void;
}
const MIME: Record<string, string> = {
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.txt': 'text/plain',
};
const METHODS = [
  'participant.artifact',
  'participant.inbox',
  'participant.read_artifact',
  'participant.claim',
  'participant.request_user_input',
  'participant.submit_result',
];
export class ParticipantExtension {
  constructor(
    private readonly db: Database.Database,
    private readonly clock = () => Date.now(),
  ) {}
  handle(raw: unknown, context: ParticipantCallContext): unknown {
    try {
      const frame = validateExternalApiFrame(raw);
      const method = frame.method as string;
      if (!METHODS.includes(method)) throw Error('UNSUPPORTED_METHOD');
      if (context.mode !== 'controller') throw Error('CONTROL_LEASE_REQUIRED');
      // WN03/MCP-03:读路径同样复验 grant/代次/撤销(不只写验证)。
      context.assertParticipantAttachment(
        String((frame.params as Record<string, unknown>)?.role_id ?? ''),
      );
      const p = (frame.params ?? {}) as Record<string, unknown>;
      if (method === 'participant.inbox')
        return extensionReply(frame.id, this.inbox(String(p.role_id ?? '')));
      if (method === 'participant.read_artifact')
        return extensionReply(
          frame.id,
          this.readArtifact(
            String(p.role_id ?? ''),
            String(p.task_id ?? ''),
            String(p.artifact_id ?? ''),
          ),
        );
      if (method === 'participant.claim')
        return extensionReply(
          frame.id,
          this.claim(String(p.role_id ?? ''), String(p.task_id ?? ''), String(p.request_key ?? '')),
        );
      if (method === 'participant.request_user_input')
        return extensionReply(
          frame.id,
          this.requestUserInput(
            String(p.role_id ?? ''),
            String(p.task_id ?? ''),
            String(p.request_key ?? ''),
            String(p.reason ?? ''),
          ),
        );
      if (method === 'participant.submit_result')
        return extensionReply(frame.id, this.submitResult(String(p.role_id ?? ''), p));
      return this.registerArtifact(frame.id, p);
    } catch (error) {
      const rawId = (raw as { id?: unknown })?.id;
      return extensionErrorReply(typeof rawId === 'string' ? rawId : 'unknown', error);
    }
  }
  /** WN03/MCP-04:稳定 request_key 幂等回执。写入统一账本:同意图同键 → 原回执(replayed),异内容 → 冲突。 */
  private key(p: Record<string, unknown>): string {
    const requestKey = p.request_key === undefined ? '' : String(p.request_key);
    if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(requestKey)) throw Error('INVALID_PARAMS');
    return requestKey;
  }
  /** 幂等账本(operations 表,与 C1R1 command_ledger/原生 operation 作用域互不冲突):
   * scope='participant-ext:<role>', opId=sha256(role|tool|request_key) 与桥侧 stableOperationId 一致。 */
  private ledger<T extends Record<string, unknown>>(
    roleId: string,
    tool: string,
    requestKey: string,
    payload: unknown,
    fn: (opRow: number) => T,
  ): T {
    return this.db
      .transaction(() => {
        const scopeKey = 'participant-ext:' + roleId;
        const opId =
          'mcp_p_' +
          createHash('sha256')
            .update(roleId + '|' + tool + '|' + requestKey)
            .digest('hex');
        const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
        const existing = this.db
          .prepare('select * from operations where scope_key=? and operation_id=?')
          .get(scopeKey, opId) as { request_hash: string; response_json: string } | undefined;
        if (existing) {
          if (existing.request_hash !== hash) throw Error('PARTICIPANT_REQUEST_CONFLICT');
          return { ...(JSON.parse(existing.response_json) as T), replayed: true };
        }
        const row = Number(
          this.db
            .prepare(
              'insert into operations(scope_key,operation_id,request_hash,response_json,committed_at_ms) values(?,?,?,?,?)',
            )
            .run(scopeKey, opId, hash, '{}', this.clock()).lastInsertRowid,
        );
        const result = fn(row);
        this.db
          .prepare('update operations set response_json=? where id=?')
          .run(JSON.stringify(result), row);
        return result;
      })
      .immediate();
  }
  private taskOfRole(roleId: string, taskId: string) {
    const task = this.db
      .prepare('select * from tasks where id=? and assignee_role_id=?')
      .get(taskId, roleId) as
      | (Record<string, string | number | null> & { id: string; state: string; space_id: string })
      | undefined;
    if (!task) throw Error('TASK_SCOPE_DENIED');
    return task;
  }
  /** 参与者认领任务:QUEUED→ACTIVE,或 WAITING_INPUT(等待用户输入且已就绪)→ACTIVE 继续推进。 */
  private claim(roleId: string, taskId: string, requestKey: string) {
    if (!taskId) throw Error('INVALID_PARAMS');
    return this.ledger(roleId, 'claim', requestKey, { taskId }, (opRow) => {
      void opRow;
      const task = this.taskOfRole(roleId, taskId);
      // 角色同一时刻只允许一个进行中的任务(domain 不变量;先显式检查,避免撞唯一索引)。
      // 只看仍在进行中的槽位任务;已终态(失败/交付等)的陈旧槽位指针不阻断认领。
      const busy = this.db
        .prepare(
          "select s.active_task_id id from role_slots s join tasks t on t.id=s.active_task_id where s.role_id=? and s.active_task_id is not null and s.active_task_id<>? and t.state in ('QUEUED','ACTIVE','WAITING_INPUT','RESULT_STAGED','SUSPENDED','NEEDS_ATTENTION')",
        )
        .get(roleId, taskId) as { id: string } | undefined;
      if (busy) throw Error('ROLE_BUSY');
      let taskInput:
        | {
            id: string;
            payload: string;
            payload_sha256: string;
            actor: string;
            operation_id: string;
            created_at_ms: number;
          }
        | undefined;
      if (task.state === 'QUEUED') {
        this.db
          .prepare('update tasks set state=?,updated_at_ms=? where id=?')
          .run('ACTIVE', this.clock(), taskId);
      } else if (task.state === 'WAITING_INPUT') {
        const w = this.db
          .prepare('select waiting_for,ready from wait_records where task_id=?')
          .get(taskId) as { waiting_for: string; ready: number } | undefined;
        if (!w || w.waiting_for !== 'user_input' || w.ready !== 1)
          throw Error('PLAN_STATE_CONFLICT');
        taskInput = this.db
          .prepare(
            'select id,payload,payload_sha256,actor,operation_id,created_at_ms from task_inputs where task_id=? and consumed_at_ms is null order by created_at_ms,id limit 1',
          )
          .get(taskId) as typeof taskInput;
        if (!taskInput) throw Error('TASK_INPUT_MISSING');
        const consumed = this.db
          .prepare(
            'update task_inputs set consumed_by_participant_request_key=?,consumed_at_ms=? where id=? and consumed_at_ms is null',
          )
          .run(requestKey, this.clock(), taskInput.id);
        if (consumed.changes !== 1) throw Error('TASK_INPUT_ALREADY_CONSUMED');
        this.db
          .prepare('update wait_records set ready=0,updated_at_ms=? where task_id=?')
          .run(this.clock(), taskId);
        this.db
          .prepare('update tasks set state=?,updated_at_ms=? where id=?')
          .run('ACTIVE', this.clock(), taskId);
      } else throw Error('PLAN_STATE_CONFLICT');
      this.db.prepare('insert or ignore into role_slots(role_id,epoch) values(?,0)').run(roleId);
      this.db.prepare('update role_slots set active_task_id=? where role_id=?').run(taskId, roleId);
      return {
        task_id: taskId,
        state: 'ACTIVE',
        claimed_at_ms: this.clock(),
        ...(taskInput
          ? {
              task_input: {
                input_id: taskInput.id,
                body: taskInput.payload,
                payload_sha256: taskInput.payload_sha256,
                actor: taskInput.actor,
                created_at_ms: taskInput.created_at_ms,
                source_id: taskInput.operation_id,
              },
            }
          : {}),
      };
    });
  }
  /** 外接角色显式声明需要用户输入:ACTIVE→WAITING_INPUT(与原生 wait 工具同一 wait_records 形状)。 */
  private requestUserInput(roleId: string, taskId: string, requestKey: string, reason: string) {
    if (!taskId || !reason || reason.length > 2048) throw Error('INVALID_PARAMS');
    return this.ledger(roleId, 'request_user_input', requestKey, { taskId, reason }, () => {
      const task = this.taskOfRole(roleId, taskId);
      if (task.state !== 'ACTIVE') throw Error('PLAN_STATE_CONFLICT');
      this.db
        .prepare(
          'insert into wait_records(task_id,waiting_for,reason,dependency_json,ready,updated_at_ms) values(?,?,?,?,?,?) on conflict(task_id) do update set waiting_for=excluded.waiting_for,reason=excluded.reason,dependency_json=excluded.dependency_json,ready=excluded.ready,updated_at_ms=excluded.updated_at_ms,generation=wait_records.generation+1',
        )
        .run(taskId, 'user_input', reason, '[]', 0, this.clock());
      this.db
        .prepare('update tasks set state=?,updated_at_ms=? where id=?')
        .run('WAITING_INPUT', this.clock(), taskId);
      return { task_id: taskId, state: 'WAITING_INPUT', waiting_for: 'user_input' };
    });
  }
  /** 提交业务结果:ACTIVE→RESULT_STAGED→DELIVERED(failed 则 FAILED)。结果直接发布给 completion
   * 目标(无原生 Run 可 settle,run_id=NULL);task.result 消息入 outbox 并即时标记 DELIVERED。
   * acceptance 保持 PENDING —— 人类 result.accept 是唯一验收门,本方法不代表批准。 */
  private submitResult(roleId: string, p: Record<string, unknown>) {
    const taskId = String(p.task_id ?? '');
    const requestKey = this.key(p);
    const outcome = String(p.outcome ?? '');
    if (!['succeeded', 'failed'].includes(outcome)) throw Error('INVALID_PARAMS');
    const summary = String(p.summary ?? '');
    const body = String(p.body ?? '');
    if (!summary || !body || summary.length > 512 || body.length > 65536)
      throw Error('INVALID_PARAMS');
    const outputs = (p.outputs ?? []) as unknown[];
    if (!Array.isArray(outputs) || outputs.length > 32) throw Error('INVALID_PARAMS');
    if (Buffer.byteLength(JSON.stringify({ summary, body, outputs }), 'utf8') > 262144)
      throw Error('PARTICIPANT_CONTENT_TOO_LARGE');
    return this.ledger(
      roleId,
      'submit_result',
      requestKey,
      { taskId, outcome, summary, body, outputs },
      (opRow) => {
        const task = this.taskOfRole(roleId, taskId);
        if (task.state !== 'ACTIVE') throw Error('PLAN_STATE_CONFLICT');
        const completion = JSON.parse(String(task.completion_json)) as {
          mode: string;
          to: { type: string; id?: string };
        };
        if (completion.mode !== 'result') throw Error('PARTICIPANT_COMPLETION_MODE_UNSUPPORTED');
        const to = completion.to;
        if (to.type === 'role') {
          const target = this.db
            .prepare('select id from roles where id=? and space_id=?')
            .get(to.id ?? '', task.space_id);
          if (!target) throw Error('INVALID_TARGET');
        } else if (to.type !== 'user') throw Error('INVALID_TARGET');
        const role = this.db
          .prepare(
            'select r.id,s.project_id from roles r join spaces s on s.id=r.space_id where r.id=?',
          )
          .get(roleId) as { id: string; project_id: string };
        const outputRefs = outputs.map((raw) => {
          const ref = raw as { kind?: string; artifact_id?: string };
          if (ref.kind !== 'artifact' || !ref.artifact_id) throw Error('INVALID_PARAMS');
          const a = this.db
            .prepare("select * from artifacts where id=? and project_id=? and state='AVAILABLE'")
            .get(ref.artifact_id, role.project_id) as
            { id: string; source_json: string } | undefined;
          if (!a) throw Error('ARTIFACT_UNAVAILABLE');
          const meta = JSON.parse(a.source_json) as { task_id?: string };
          if (meta.task_id !== undefined && meta.task_id !== taskId)
            throw Error('TASK_SCOPE_DENIED');
          return { kind: 'artifact', artifact_id: ref.artifact_id };
        });
        const resultId = 'result_' + randomUUID();
        this.db
          .prepare('insert into results values(?,?,?,?,?,?,?,?,?)')
          .run(
            resultId,
            taskId,
            null,
            outcome,
            summary,
            body,
            JSON.stringify(outputRefs),
            'PUBLISHED',
            this.clock(),
          );
        this.db
          .prepare(
            'insert into entity_revisions values(?,?,?) on conflict(entity_id) do update set revision=excluded.revision,updated_at_ms=excluded.updated_at_ms',
          )
          .run(resultId, 0, this.clock());
        const messageId = 'message_' + randomUUID();
        this.db
          .prepare(
            'insert into messages(id,space_id,task_id,kind,from_kind,from_role_id,to_kind,to_role_id,payload_json,operation_row_id,created_at_ms) values(?,?,?,?,?,?,?,?,?,?,?)',
          )
          .run(
            messageId,
            task.space_id,
            taskId,
            'task.result',
            'role',
            roleId,
            to.type,
            to.type === 'role' ? (to.id ?? null) : null,
            JSON.stringify({
              kind: 'task.result',
              to,
              result_id: resultId,
              outcome,
              summary,
              body,
              outputs: outputRefs,
            }),
            opRow,
            this.clock(),
          );
        const outboxId = 'outbox_' + randomUUID();
        this.db
          .prepare('insert into outbox(id,message_id,state,updated_at_ms) values(?,?,?,?)')
          .run(outboxId, messageId, 'QUEUED', this.clock());
        // Participant 结果即提交即发布(无 Run settle 屏障可等),投递记录同步落 DELIVERED。
        this.db
          .prepare("update outbox set state='DELIVERED',updated_at_ms=? where id=?")
          .run(this.clock(), outboxId);
        this.db
          .prepare('update tasks set state=?,updated_at_ms=? where id=?')
          .run('RESULT_STAGED', this.clock(), taskId);
        const finalState = outcome === 'succeeded' ? 'DELIVERED' : 'FAILED';
        this.db
          .prepare('update tasks set state=?,updated_at_ms=? where id=?')
          .run(finalState, this.clock(), taskId);
        this.db
          .prepare('update role_slots set active_task_id=null where role_id=? and active_task_id=?')
          .run(roleId, taskId);
        return {
          result_id: resultId,
          task_id: taskId,
          outcome,
          state: finalState,
          publication_state: 'PUBLISHED',
          acceptance: task.acceptance,
          downstream: to,
          delivered_message_id: messageId,
        };
      },
    );
  }
  /** WN03:结构化任务收件箱(本角色)。body/inputs/expected/completion 逐字来自任务请求,
   * 角色据此读取任务正文与必需输入,不依赖聊天提示词转述。 */
  private inbox(roleId: string) {
    const role = this.db
      .prepare(
        'select r.id,s.project_id from roles r join spaces s on s.id=r.space_id where r.id=?',
      )
      .get(roleId);
    if (!role) throw Error('ROLE_NOT_FOUND');
    const rows = this.db
      .prepare(
        `select t.id,t.summary,t.body,t.state,t.acceptance,t.created_at_ms,t.updated_at_ms,
           t.request_json,t.completion_json,t.problem_target_json,t.parent_task_id,
           (select w.waiting_for from wait_records w where w.task_id=t.id) waiting_for,
           (select w.reason from wait_records w where w.task_id=t.id) wait_reason,
           (select w.ready from wait_records w where w.task_id=t.id) wait_ready,
           (select i.id from task_inputs i where i.task_id=t.id and i.consumed_at_ms is null order by i.created_at_ms,i.id limit 1) task_input_id,
           (select i.payload from task_inputs i where i.task_id=t.id and i.consumed_at_ms is null order by i.created_at_ms,i.id limit 1) task_input_payload,
           (select i.payload_sha256 from task_inputs i where i.task_id=t.id and i.consumed_at_ms is null order by i.created_at_ms,i.id limit 1) task_input_sha256,
           (select i.created_at_ms from task_inputs i where i.task_id=t.id and i.consumed_at_ms is null order by i.created_at_ms,i.id limit 1) task_input_created_at_ms,
           (select r.id from results r where r.task_id=t.id) result_id,
           (select r.outcome from results r where r.task_id=t.id) result_outcome,
           (select r.publication_state from results r where r.task_id=t.id) publication_state
         from tasks t where t.assignee_role_id=? order by t.created_at_ms desc limit 50`,
      )
      .all(roleId) as Record<string, string | number | null>[];
    const artifacts = this.db
      .prepare(
        "select id,sha256,byte_size,media_type,state,json_extract(source_json,'$.name') name from artifacts where project_id=?",
      )
      .all((role as { project_id: string }).project_id) as Record<string, string | number>[];
    const byId = new Map(artifacts.map((a) => [String(a.id), a]));
    const tasks = rows.map((t) => {
      const request = JSON.parse(String(t.request_json)) as {
        inputs?: {
          kind?: string;
          type?: string;
          artifact_id?: string;
          id?: string;
          uri?: string;
        }[];
        expected?: string[];
      };
      const inputs = (request.inputs ?? []).map((ref) => {
        const artifactId = ref.artifact_id ?? ref.id ?? '';
        const a = byId.get(artifactId);
        return {
          kind: ref.kind ?? ref.type ?? 'external',
          ...(artifactId ? { artifact_id: artifactId } : {}),
          ...(ref.uri ? { uri: ref.uri } : {}),
          ...(a
            ? {
                name: a.name ?? null,
                media_type: a.media_type,
                sha256: a.sha256,
                byte_size: a.byte_size,
                state: a.state,
              }
            : {}),
        };
      });
      return {
        id: t.id,
        state: t.state,
        summary: t.summary,
        body: t.body,
        inputs,
        expected: request.expected ?? [],
        completion: JSON.parse(String(t.completion_json)),
        problem_target: JSON.parse(String(t.problem_target_json)),
        parent_task_id: t.parent_task_id ?? null,
        acceptance: t.acceptance,
        ...(t.state === 'WAITING_INPUT'
          ? {
              waiting_for: t.waiting_for ?? null,
              wait_reason: t.wait_reason ?? null,
              user_input_ready: t.wait_ready === 1,
              ...(t.task_input_id
                ? {
                    task_input: {
                      input_id: t.task_input_id,
                      body: t.task_input_payload,
                      payload_sha256: t.task_input_sha256,
                      created_at_ms: t.task_input_created_at_ms,
                    },
                  }
                : {}),
            }
          : {}),
        ...(t.result_id
          ? {
              result: {
                id: t.result_id,
                outcome: t.result_outcome,
                publication_state: t.publication_state,
              },
            }
          : {}),
        created_at_ms: t.created_at_ms,
        updated_at_ms: t.updated_at_ms,
      };
    });
    return { role_id: roleId, tasks };
  }
  /** WN03/合同§5:只读任务引用的已登记 Artifact(版本=sha/bytes;不任意读盘)。 */
  private readArtifact(roleId: string, taskId: string, artifactId: string) {
    const role = this.db
      .prepare(
        'select r.id,s.project_id from roles r join spaces s on s.id=r.space_id where r.id=?',
      )
      .get(roleId) as { id: string; project_id: string } | undefined;
    if (!role) throw Error('ROLE_NOT_FOUND');
    const task = this.db
      .prepare('select id from tasks where id=? and assignee_role_id=?')
      .get(taskId, roleId);
    if (!task) throw Error('TASK_SCOPE_DENIED');
    const row = this.db
      .prepare(
        'select state,source_json,sha256,byte_size,media_type,created_at_ms from artifacts where id=?',
      )
      .get(artifactId) as
      | {
          state: string;
          source_json: string;
          sha256: string;
          byte_size: number;
          media_type: string;
          created_at_ms: number;
        }
      | undefined;
    if (!row) throw Error('ARTIFACT_NOT_FOUND');
    const meta = JSON.parse(row.source_json) as {
      path?: string;
      task_id?: string;
      project_id?: string;
    };
    const artifactProject = this.db
      .prepare('select project_id from artifacts where id=?')
      .get(artifactId) as { project_id: string } | undefined;
    if (!artifactProject || artifactProject.project_id !== role.project_id)
      throw Error('TASK_SCOPE_DENIED');
    if (meta.task_id !== taskId && meta.task_id !== undefined) throw Error('TASK_SCOPE_DENIED');
    if (row.state !== 'AVAILABLE') throw Error('ARTIFACT_NOT_READABLE');
    if (!meta.path || !existsSync(meta.path)) throw Error('ARTIFACT_FILE_MISSING');
    const bytes = readFileSync(meta.path);
    if (
      bytes.length !== row.byte_size ||
      createHash('sha256').update(bytes).digest('hex') !== row.sha256
    )
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
  private registerArtifact(frameId: string, p: Record<string, unknown>) {
    const roleId = String(p.role_id ?? '');
    const name = String(p.name ?? '');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(name) || name.includes('..'))
      throw Error('PARTICIPANT_NAME_INVALID');
    const mediaType = MIME[name.slice(name.lastIndexOf('.')).toLowerCase()];
    if (!mediaType) throw Error('PARTICIPANT_TYPE_REJECTED');
    const content = p.content;
    if (typeof content !== 'string' || !content) throw Error('PARTICIPANT_CONTENT_INVALID');
    const bytes = Buffer.from(content, 'utf8');
    if (bytes.length > 262144) throw Error('PARTICIPANT_CONTENT_TOO_LARGE');
    const taskId = p.task_id === undefined ? null : String(p.task_id);
    // WN03 语义保持:request_key 在 MCP 工具层必填,核心扩展层允许缺省(无幂等账本直写)。
    const requestKey = p.request_key === undefined ? null : String(p.request_key);
    if (requestKey !== null && !/^[A-Za-z0-9_.:-]{1,128}$/.test(requestKey))
      throw Error('INVALID_PARAMS');
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
      ? (
          this.db
            .prepare('select canonical_path from workspaces where id=?')
            .get(binding.workspace_id) as { canonical_path: string } | undefined
        )?.canonical_path
      : undefined;
    if (!workspace) throw Error('WORKSPACE_SCOPE');
    const createdPaths: string[] = [];
    let result: {
      artifact_id: string;
      sha256: string;
      byte_size: number;
      media_type: string;
      name: string;
      replayed?: boolean;
    };
    try {
      result = this.db
        .transaction(() => {
        const dir = resolve(workspace, 'agentrouter-artifacts');
        mkdirSync(dir, { recursive: true });
        const prior = this.db
          .prepare(
            "select id from artifacts where project_id=? and json_extract(source_json,'$.request_key')=?",
          )
          .get(scopeRow.project_id, requestKey) as { id: string } | undefined;
        if (prior) {
          const row = this.db
            .prepare('select source_json,sha256,byte_size,media_type from artifacts where id=?')
            .get(prior.id) as {
            source_json: string;
            sha256: string;
            byte_size: number;
            media_type: string;
          };
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
        const finalPath = join(dir, name);
        if (existsSync(finalPath)) throw Error('PARTICIPANT_NAME_TAKEN');
        const tempPath = join(dir, '.' + randomUUID() + '.tmp');
        createdPaths.push(tempPath);
        writeFileSync(tempPath, bytes);
        renameSync(tempPath, finalPath);
        createdPaths.push(finalPath);
        const sha = createHash('sha256').update(bytes).digest('hex');
        const objectRoot = resolve(dirname(this.db.name), 'artifacts');
        mkdirSync(objectRoot, { recursive: true });
        const blobPath = join(objectRoot, sha);
        if (!existsSync(blobPath)) {
          const blobTemp = join(objectRoot, '.' + randomUUID() + '.tmp');
          createdPaths.push(blobTemp);
          writeFileSync(blobTemp, bytes);
          renameSync(blobTemp, blobPath);
          createdPaths.push(blobPath);
        }
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
            JSON.stringify({
              name,
              path: finalPath,
              role_id: roleId,
              ...(taskId ? { task_id: taskId } : {}),
              ...(requestKey ? { request_key: requestKey } : {}),
              source: 'PARTICIPANT',
            }),
            'AVAILABLE',
            this.clock(),
          );
        this.db
          .prepare(
            'insert into entity_revisions values(?,?,?) on conflict(entity_id) do update set revision=excluded.revision,updated_at_ms=excluded.updated_at_ms',
          )
          .run(id, 0, this.clock());
        return {
          artifact_id: id,
          sha256: sha,
          byte_size: bytes.length,
          media_type: mediaType,
          name,
        };
        })
        .immediate();
    } catch (cause) {
      const cleanupFailures: unknown[] = [];
      for (const path of createdPaths.reverse()) {
        if (!existsSync(path)) continue;
        try {
          unlinkSync(path);
        } catch (error) {
          cleanupFailures.push(error);
        }
      }
      if (cleanupFailures.length)
        throw new Error('PARTICIPANT_ARTIFACT_ROLLBACK_INCOMPLETE', { cause });
      throw cause;
    }
    return extensionReply(frameId, result);
  }
}
