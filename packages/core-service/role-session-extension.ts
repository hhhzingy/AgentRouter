import {
  validateExternalApiFrame,
  extensionReply,
  extensionErrorReply,
} from '../client-contract/external-api-1.ts';
import { Ajv2020 } from 'ajv/dist/2020.js';
/** roleSession.* 草案扩展（待CCR协商，未入冻结清单）。
 * 同一稳定Role ID下的多工作会话：列表/新建/切换/会话历史。
 * Binding/epoch 仍归执行授权；本扩展只管理会话归属与历史隔离。 */
export interface RoleSessionDispatchContext {
  principal: string;
  clientId?: string;
  mode?: string;
  assertControllerLease: (leaseId: string) => void;
}
const ajv = new Ajv2020({ strict: true, allErrors: false });
const compile = (schema: object) => ajv.compile(schema);
const IdString = { type: 'string', minLength: 1, maxLength: 160 } as const;
const listParams = compile({ type: 'object', additionalProperties: false, required: ['role_id'], properties: { role_id: IdString } });
const createParams = compile({
  type: 'object', additionalProperties: false, required: ['role_id', 'name'],
  properties: { role_id: IdString, name: { type: 'string', minLength: 1, maxLength: 80 } },
});
const switchParams = compile({
  type: 'object', additionalProperties: false, required: ['role_id', 'session_id'],
  properties: { role_id: IdString, session_id: IdString },
});
const historyParams = compile({
  type: 'object', additionalProperties: false, required: ['role_id', 'session_id'],
  properties: { role_id: IdString, session_id: IdString, limit: { type: 'integer', minimum: 1, maximum: 500 } },
});
const sessionVMSchema = {
  type: 'object', additionalProperties: false,
  required: ['id', 'role_id', 'seq', 'name', 'state', 'generation', 'created_at_ms', 'activated_at_ms'],
  properties: {
    id: IdString, role_id: IdString, seq: { type: 'integer', minimum: 1 }, name: { type: 'string' },
    state: { enum: ['ACTIVE', 'ARCHIVED'] }, generation: { type: 'integer', minimum: 1 },
    created_at_ms: { type: 'integer', minimum: 0 }, activated_at_ms: { type: 'integer', minimum: 0 },
    hasNativeSession: { type: 'boolean' },
  },
} as const;
const listResult = compile({ type: 'object', additionalProperties: false, required: ['sessions', 'active_session_id'], properties: { sessions: { type: 'array', items: sessionVMSchema }, active_session_id: IdString } });
const historyResult = compile({
  type: 'object', additionalProperties: false, required: ['items'],
  properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['seq', 'kind', 'title'], properties: {
    seq: { type: 'integer' }, kind: { type: 'string' }, title: { type: 'string' },
    body: { type: 'string' }, state: { type: 'string' }, at_ms: { type: 'integer' }, task_id: { type: ['string', 'null'] },
  } } } },
});
export class RoleSessionExtension {
  constructor(private readonly db: import('better-sqlite3').Database, private readonly clock = () => Date.now()) {}
  handle(raw: unknown, context: RoleSessionDispatchContext): unknown {
    try {
      const frame = validateExternalApiFrame(raw);
      const method = frame.method as string;
      if (!method.startsWith('roleSession.')) throw Error('INVALID_FRAME');
      const p = (frame.params ?? {}) as Record<string, unknown>;
      let result: unknown;
      if (method === 'roleSession.list') {
        if (!listParams(p)) throw Error('INVALID_PARAMS');
        result = this.list(String(p.role_id));
      } else if (method === 'roleSession.create') {
        if (context.mode !== 'controller') throw Error('CONTROL_LEASE_REQUIRED');
        context.assertControllerLease(frame.lease_id!);
        if (!createParams(p)) throw Error('INVALID_PARAMS');
        result = { session: this.create(String(p.role_id), String(p.name)) };
      } else if (method === 'roleSession.switch') {
        if (context.mode !== 'controller') throw Error('CONTROL_LEASE_REQUIRED');
        context.assertControllerLease(frame.lease_id!);
        if (!switchParams(p)) throw Error('INVALID_PARAMS');
        result = this.switch(String(p.role_id), String(p.session_id));
      } else if (method === 'roleSession.history') {
        if (!historyParams(p)) throw Error('INVALID_PARAMS');
        result = this.history(String(p.role_id), String(p.session_id), Number(p.limit ?? 200));
      } else throw Error('UNSUPPORTED_METHOD');
      return extensionReply(frame.id, result);
    } catch (error) {
      const rawId = (raw as { id?: unknown })?.id;
      return extensionErrorReply(typeof rawId === 'string' ? rawId : 'unknown', error);
    }
  }
  private rows(roleId: string) {
    return this.db
      .prepare('select * from role_sessions where role_id=? order by seq')
      .all(roleId) as Record<string, unknown>[];
  }
  private assertRole(roleId: string) {
    if (!this.db.prepare('select id from roles where id=?').get(roleId))
      throw Error('ROLE_NOT_FOUND');
  }
  private vm(row: Record<string, unknown>) {
    return {
      id: row.id, role_id: row.role_id, seq: row.seq, name: row.name, state: row.state,
      generation: row.generation, created_at_ms: row.created_at_ms, activated_at_ms: row.activated_at_ms,
      hasNativeSession: row.native_session_ref !== null && row.native_session_ref !== undefined,
    };
  }
  private list(roleId: string) {
    this.assertRole(roleId);
    const sessions = this.rows(roleId).map((r) => this.vm(r));
    const active = sessions.find((s) => s.state === 'ACTIVE');
    return { sessions, active_session_id: active!.id };
  }
  private create(roleId: string, name: string) {
    this.assertRole(roleId);
    const current = this.db
      .prepare("select * from role_sessions where role_id=? and state='ACTIVE'")
      .get(roleId) as Record<string, unknown> | undefined;
    if (!current) throw Error('ROLE_SESSION_STATE_INVALID');
    const id = 'rsess_' + globalThis.crypto.randomUUID();
    return this.db.transaction(() => {
      const generation = Number(current.generation) + 1;
      this.db.prepare("update role_sessions set state='ARCHIVED', activated_at_ms=? where id=?").run(this.clock(), current.id);
      this.db
        .prepare('insert into role_sessions(id,role_id,seq,name,state,binding_id,binding_epoch,generation,created_at_ms,activated_at_ms) values(?,?,?,?,?,?,?,?,?,?)')
        .run(id, roleId, Number(current.seq) + 1, name, 'ACTIVE', current.binding_id, current.binding_epoch, generation, this.clock(), this.clock());
      return this.vm(this.db.prepare('select * from role_sessions where id=?').get(id) as Record<string, unknown>);
    }).immediate();
  }
  private switch(roleId: string, sessionId: string) {
    this.assertRole(roleId);
    const target = this.db
      .prepare('select * from role_sessions where id=? and role_id=?')
      .get(sessionId, roleId) as Record<string, unknown> | undefined;
    if (!target) throw Error('ROLE_SESSION_NOT_FOUND');
    if (target.state === 'ACTIVE') return this.vm(target); // 幂等：切换到当前会话无副作用
    return this.db.transaction(() => {
      const current = this.db
        .prepare("select * from role_sessions where role_id=? and state='ACTIVE'")
        .get(roleId) as Record<string, unknown>;
      const generation = Math.max(Number(current.generation), Number(target.generation)) + 1;
      this.db.prepare("update role_sessions set state='ARCHIVED', activated_at_ms=? where id=?").run(this.clock(), current.id);
      this.db.prepare("update role_sessions set state='ACTIVE', generation=?, activated_at_ms=? where id=?").run(generation, this.clock(), target.id);
      return this.vm(this.db.prepare('select * from role_sessions where id=?').get(target.id) as Record<string, unknown>);
    }).immediate();
  }
  private history(roleId: string, sessionId: string, limit: number) {
    this.assertRole(roleId);
    const session = this.db
      .prepare('select * from role_sessions where id=? and role_id=?')
      .get(sessionId, roleId);
    if (!session) throw Error('ROLE_SESSION_NOT_FOUND');
    const items = this.db
      .prepare('select seq,kind,title,body,state,at_ms,task_id from conversation_items where role_session_id=? order by seq limit ?')
      .all(sessionId, limit);
    return { items };
  }
}
