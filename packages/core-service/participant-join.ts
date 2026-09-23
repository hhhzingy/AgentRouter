import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

export type ParticipantKind = 'CHATGPT_WEB' | 'MANAGED_HARNESS' | 'PAIR_CODE';
const KINDS = new Set<ParticipantKind>(['CHATGPT_WEB', 'MANAGED_HARNESS', 'PAIR_CODE']);

export interface RoleIdentityPack {
  project_id: string;
  project_display_name: string;
  role_id: string;
  slot_id: string;
  slot_state: string;
  work_session_id: string | null;
  work_session_state: string | null;
  short_ref: string;
  display_name: string;
  mission: string;
  responsibilities: unknown;
  out_of_scope: unknown;
  current_assignment: unknown;
  effective_permissions: unknown;
  default_result_target: unknown;
  collaboration: unknown;
  identity_revision: number;
  charter_revision: number;
  permission_revision: number;
  binding_generation: number;
  history_only: boolean;
  participant_kind: ParticipantKind;
  safety_protocol: {
    request_key_required: true;
    history_read_only: true;
    cannot_expand_permissions: true;
    user_approval_must_not_be_fabricated: true;
  };
}

function sha256(text: string) {
  return createHash('sha256').update(text).digest('hex');
}

export class ParticipantJoinExtension {
  constructor(
    private readonly db: Database.Database,
    private readonly clock = () => Date.now(),
  ) {}

  private one(sql: string, ...args: unknown[]): any {
    return this.db.prepare(sql).get(...args);
  }

  createSlot(input: {
    roleId: string;
    name: string;
    participantKind: ParticipantKind;
    workSessionId?: string | null;
  }): { slot_id: string; seq: number; state: string; claim_code?: string } {
    if (!KINDS.has(input.participantKind)) throw Error('INVALID_PARAMS');
    if (!this.one('select id from roles where id=?', input.roleId)) throw Error('ROLE_NOT_FOUND');
    if (input.workSessionId) {
      const ws = this.one('select id,role_id,state from role_sessions where id=?', input.workSessionId);
      if (!ws || ws.role_id !== input.roleId || ws.state !== 'ACTIVE')
        throw Error('ROLE_SESSION_NOT_FOUND');
      if (this.one("select id from participant_bindings where work_session_id=? and state='ACTIVE'", input.workSessionId))
        throw Error('ROLE_WORKSESSION_ALREADY_BOUND');
    }
    const claimCode = input.participantKind === 'PAIR_CODE' ? randomUUID().replace(/-/g, '').slice(0, 24) : undefined;
    return this.db
      .transaction(() => {
        const seq =
          Number(this.one('select coalesce(max(seq),0) n from work_session_slots where role_id=?', input.roleId)?.n ?? 0) + 1;
        const id = 'wslot_' + randomUUID();
        this.db
          .prepare(
            'insert into work_session_slots(id,role_id,seq,name,participant_kind,state,work_session_id,binding_generation,claim_code_hash,created_at_ms) values(?,?,?,?,?,?,?,?,?,?)',
          )
          .run(
            id,
            input.roleId,
            seq,
            input.name,
            input.participantKind,
            'OPEN',
            input.workSessionId ?? null,
            1,
            claimCode ? sha256(claimCode) : null,
            this.clock(),
          );
        return { slot_id: id, seq, state: 'OPEN', ...(claimCode ? { claim_code: claimCode } : {}) };
      })
      .immediate();
  }

  listSlots(roleId: string) {
    if (!this.one('select id from roles where id=?', roleId)) throw Error('ROLE_NOT_FOUND');
    const slots = this.db
      .prepare('select id,role_id,seq,name,participant_kind,state,work_session_id,binding_generation,created_at_ms from work_session_slots where role_id=? order by seq')
      .all(roleId) as Record<string, unknown>[];
    const bindings = this.db
      .prepare("select slot_id,participant_kind,state from participant_bindings where role_id=? and state='ACTIVE'")
      .all(roleId) as { slot_id: string; participant_kind: ParticipantKind; state: string }[];
    const bySlot = new Map(bindings.map((binding) => [binding.slot_id, binding]));
    return {
      slots: slots.map((slot) => {
        const binding = bySlot.get(String(slot.id));
        const shortRef = `W${slot.seq}`;
        return {
          ...slot,
          short_ref: shortRef,
          join_instruction_display: slot.state === 'OPEN'
            ? `Role ${roleId}, Slot ${shortRef}. 授权的 Participant 可使用此引用认领；仍需有效授权。`
            : null,
          binding_summary: binding
            ? {
                display_name: {
                  CHATGPT_WEB: 'ChatGPT 网页 Participant',
                  MANAGED_HARNESS: 'Managed Harness',
                  PAIR_CODE: '配对 Participant',
                }[binding.participant_kind],
                participant_kind: binding.participant_kind,
                state: binding.state,
                last_seen_at_ms: null,
                external_session_display: null,
              }
            : null,
        };
      }),
    };
  }

  join(input: {
    roleId: string;
    slotId?: string;
    shortRef?: string;
    participantKind: ParticipantKind;
    requestKey: string;
    principal: string;
    grantId?: string | null;
    claimCode?: string | null;
    externalSessionRef?: string | null;
    generation?: number;
  }) {
    if (!KINDS.has(input.participantKind)) throw Error('INVALID_PARAMS');
    if (!input.requestKey || input.requestKey.length > 160) throw Error('INVALID_PARAMS');
    const slot = this.resolveSlot(input.roleId, input.slotId, input.shortRef);
    if (slot.participant_kind !== input.participantKind) throw Error('PARTICIPANT_KIND_MISMATCH');
    if (slot.state === 'CLOSED') throw Error('ROLE_SLOT_CLOSED');
    const replay = this.one(
      'select * from participant_bindings where role_id=? and request_key=?',
      input.roleId,
      input.requestKey,
    );
    if (replay) {
      if (
        replay.slot_id !== slot.id ||
        replay.participant_kind !== input.participantKind ||
        (input.grantId && replay.grant_id && replay.grant_id !== input.grantId)
      )
        throw Error('REQUEST_KEY_CONFLICT');
      return this.joinView(replay, slot);
    }
    if (slot.state === 'BOUND') {
      const occupant = this.one("select * from participant_bindings where slot_id=? and state='ACTIVE'", slot.id);
      if (occupant && occupant.principal !== input.principal) throw Error('ROLE_WORKSESSION_ALREADY_BOUND');
      if (occupant && occupant.principal === input.principal) return this.joinView(occupant, slot);
    }
    const roleOccupant = this.one(
      "select * from participant_bindings where role_id=? and state='ACTIVE' order by created_at_ms desc limit 1",
      input.roleId,
    );
    if (roleOccupant) throw Error('ROLE_WORKSESSION_ALREADY_BOUND');
    if (input.participantKind === 'PAIR_CODE') {
      if (!input.claimCode || !slot.claim_code_hash || sha256(input.claimCode) !== slot.claim_code_hash)
        throw Error('PAIR_CODE_INVALID');
    }
    if (input.generation !== undefined && Number(input.generation) !== Number(slot.binding_generation))
      throw Error('BINDING_GENERATION_STALE');
    return this.db
      .transaction(() => {
        let workSessionId: string | null = slot.work_session_id ?? null;
        if (!workSessionId) {
          const unbound = this.one(
            "select s.id from role_sessions s where s.role_id=? and s.state='ACTIVE' and not exists (select 1 from participant_bindings b where b.work_session_id=s.id)",
            input.roleId,
          );
          workSessionId = unbound?.id ?? null;
        }
        if (!workSessionId)
          workSessionId = this.createParticipantSession(input.roleId, String(slot.name ?? 'Participant'));
        const ws = this.one('select id,state from role_sessions where id=? and role_id=?', workSessionId, input.roleId);
        if (!ws) throw Error('ROLE_SESSION_NOT_FOUND');
        if (ws.state !== 'ACTIVE') throw Error('SESSION_ARCHIVED_READ_ONLY');
        if (this.one("select id from participant_bindings where work_session_id=? and state='ACTIVE' and principal!=?", workSessionId, input.principal))
          throw Error('ROLE_WORKSESSION_ALREADY_BOUND');
        const id = 'pbind_' + randomUUID();
        this.db
          .prepare(
            'insert into participant_bindings(id,slot_id,role_id,work_session_id,principal,participant_kind,external_session_ref,grant_id,generation,state,request_key,created_at_ms) values(?,?,?,?,?,?,?,?,?,\'ACTIVE\',?,?)',
          )
          .run(
            id,
            slot.id,
            input.roleId,
            workSessionId,
            input.principal,
            input.participantKind,
            input.externalSessionRef ?? null,
            input.grantId ?? null,
            slot.binding_generation,
            input.requestKey,
            this.clock(),
          );
        this.db
          .prepare("update work_session_slots set state='BOUND',work_session_id=?,claim_code_hash=NULL where id=?")
          .run(workSessionId, slot.id);
        const binding = this.one('select * from participant_bindings where id=?', id);
        return this.joinView(binding, { ...slot, state: 'BOUND', work_session_id: workSessionId });
      })
      .immediate();
  }

  identity(roleId: string, principal: string): RoleIdentityPack {
    const binding = this.one(
      "select * from participant_bindings where role_id=? and principal=? and state='ACTIVE' order by created_at_ms desc limit 1",
      roleId,
      principal,
    );
    const slot = binding
      ? this.one('select * from work_session_slots where id=?', binding.slot_id)
      : this.one("select * from work_session_slots where role_id=? and state='BOUND' order by seq limit 1", roleId);
    if (!slot) throw Error('ROLE_SLOT_NOT_FOUND');
    return this.identityPack(roleId, slot, binding ?? null);
  }

  leave(input: { roleId: string; slotId: string; principal?: string }) {
    const slot = this.one('select * from work_session_slots where id=? and role_id=?', input.slotId, input.roleId);
    if (!slot) throw Error('ROLE_SLOT_NOT_FOUND');
    this.db
      .transaction(() => {
        const active = this.one("select * from participant_bindings where slot_id=? and state='ACTIVE'", slot.id);
        if (active && input.principal && active.principal !== input.principal) throw Error('ROLE_WORKSESSION_ALREADY_BOUND');
        const workSessionId = String(active?.work_session_id ?? slot.work_session_id ?? '');
        if (workSessionId) this.assertSessionDrained(workSessionId);
        this.db.prepare("update participant_bindings set state='ENDED' where slot_id=? and state='ACTIVE'").run(slot.id);
        if (workSessionId) {
          this.db
            .prepare("update role_sessions set state='ARCHIVED' where id=? and role_id=? and state='ACTIVE'")
            .run(workSessionId, input.roleId);
          this.db
            .prepare(
              "update role_session_activations set state='ENDED',ended_at_ms=? where role_session_id=? and state='ACTIVE'",
            )
            .run(this.clock(), workSessionId);
        }
        this.db
          .prepare("update work_session_slots set state='CLOSED',binding_generation=binding_generation+1,claim_code_hash=NULL where id=?")
          .run(slot.id);
      })
      .immediate();
    return { slot_id: slot.id, state: 'CLOSED' };
  }

  /** Managed Harness 创建新 WorkSession 后复用同一 Bind/Identity 原语，不要求模型手工 join。 */
  bindManagedSession(roleId: string, workSessionId: string) {
    const ws = this.one(
      "select id,state from role_sessions where id=? and role_id=?",
      workSessionId,
      roleId,
    );
    if (!ws || ws.state !== 'ACTIVE') throw Error('ROLE_SESSION_NOT_FOUND');
    const nonManaged = this.one(
      "select id from participant_bindings where role_id=? and state='ACTIVE' and participant_kind!='MANAGED_HARNESS'",
      roleId,
    );
    if (nonManaged) throw Error('ROLE_WORKSESSION_ALREADY_BOUND');
    this.db
      .prepare(
        "update participant_bindings set state='ENDED' where role_id=? and state='ACTIVE' and participant_kind='MANAGED_HARNESS'",
      )
      .run(roleId);
    let slot = this.one(
      "select * from work_session_slots where role_id=? and participant_kind='MANAGED_HARNESS' and state!='CLOSED' order by seq desc limit 1",
      roleId,
    );
    if (!slot) {
      const seq =
        Number(
          this.one(
            'select coalesce(max(seq),0) n from work_session_slots where role_id=?',
            roleId,
          )?.n ?? 0,
        ) + 1;
      const slotId = 'wslot_' + randomUUID();
      this.db
        .prepare(
          "insert into work_session_slots(id,role_id,seq,name,participant_kind,state,work_session_id,binding_generation,created_at_ms) values(?,?,?,'managed','MANAGED_HARNESS','OPEN',NULL,1,?)",
        )
        .run(slotId, roleId, seq, this.clock());
      slot = this.one('select * from work_session_slots where id=?', slotId)!;
    }
    const generation = Number(slot.binding_generation) + (slot.state === 'BOUND' ? 1 : 0);
    this.db
      .prepare(
        "update work_session_slots set state='BOUND',work_session_id=?,binding_generation=?,claim_code_hash=NULL where id=?",
      )
      .run(workSessionId, generation, slot.id);
    const bindingId = 'pbind_' + randomUUID();
    this.db
      .prepare(
        "insert into participant_bindings(id,slot_id,role_id,work_session_id,principal,participant_kind,generation,state,request_key,created_at_ms) values(?,?,?,?,?,'MANAGED_HARNESS',?,'ACTIVE',?,?)",
      )
      .run(
        bindingId,
        slot.id,
        roleId,
        workSessionId,
        'managed_harness',
        generation,
        `managed:${roleId}:${workSessionId}`,
        this.clock(),
      );
    return this.joinView(
      this.one('select * from participant_bindings where id=?', bindingId),
      this.one('select * from work_session_slots where id=?', slot.id),
    );
  }

  private assertSessionDrained(workSessionId: string) {
    const unfinished = this.one(
      "select id from tasks where role_session_id=? and state in ('QUEUED','WAITING_INPUT','ACTIVE','RESULT_STAGED','NEEDS_ATTENTION','SUSPENDED') limit 1",
      workSessionId,
    );
    const liveRun = this.one(
      "select id from runs where role_session_id=? and state not in ('SUCCEEDED','FAILED','CANCELLED') limit 1",
      workSessionId,
    );
    if (unfinished || liveRun) throw Error('ROLE_SESSION_QUEUE_NOT_DRAINED');
  }

  private createParticipantSession(roleId: string, name: string): string {
    this.assertSessionDrained(
      String(
        this.one("select id from role_sessions where role_id=? and state='ACTIVE'", roleId)?.id ?? '',
      ),
    );
    const binding = this.one(
      'select * from bindings where role_id=? and is_current=1',
      roleId,
    );
    if (!binding) throw Error('ROLE_BINDING_NOT_FOUND');
    const current = this.one("select id from role_sessions where role_id=? and state='ACTIVE'", roleId);
    if (current) {
      this.db.prepare("update role_sessions set state='ARCHIVED' where id=?").run(current.id);
      this.db
        .prepare(
          "update role_session_activations set state='ENDED',ended_at_ms=? where role_session_id=? and state='ACTIVE'",
        )
        .run(this.clock(), current.id);
    }
    const seq =
      Number(
        this.one('select coalesce(max(seq),0) n from role_sessions where role_id=?', roleId)?.n ??
          0,
      ) + 1;
    const generation =
      Number(
        this.one(
          'select coalesce(max(generation),0) n from role_sessions where role_id=?',
          roleId,
        )?.n ?? 0,
      ) + 1;
    const id = 'rsess_' + randomUUID();
    const now = this.clock();
    this.db
      .prepare(
        'insert into role_sessions(id,role_id,seq,name,state,binding_id,binding_epoch,harness,driver_id,workspace_affinity_json,native_session_ref,generation,created_at_ms,activated_at_ms) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        roleId,
        seq,
        name,
        'ACTIVE',
        binding.id,
        binding.epoch,
        binding.harness,
        binding.harness,
        JSON.stringify({ workspace_id: binding.workspace_id }),
        null,
        generation,
        now,
        now,
      );
    const planned = this.db
      .prepare(
        "select id from tasks where assignee_role_id=? and role_session_id is null and state='QUEUED'",
      )
      .all(roleId) as { id: string }[];
    if (planned.length) {
      this.db
        .prepare(
          "update tasks set role_session_id=? where assignee_role_id=? and role_session_id is null and state='QUEUED'",
        )
        .run(id, roleId);
      const attachConversation = this.db.prepare(
        'update conversation_items set role_session_id=? where task_id=? and role_session_id is null',
      );
      for (const task of planned) attachConversation.run(id, task.id);
    }
    return id;
  }

  private resolveSlot(roleId: string, slotId?: string, shortRef?: string) {
    if (slotId) {
      const slot = this.one('select * from work_session_slots where id=? and role_id=?', slotId, roleId);
      if (!slot) throw Error('ROLE_SLOT_NOT_FOUND');
      return slot;
    }
    if (shortRef) {
      const parts = String(shortRef).split(':');
      const seqText = /^W([1-9][0-9]*)$/i.exec(parts[parts.length - 1] ?? '');
      const seq = seqText ? Number(seqText[1]) : NaN;
      const bySeq = Number.isInteger(seq)
        ? this.one('select * from work_session_slots where role_id=? and seq=?', roleId, seq)
        : undefined;
      const byName = this.one('select * from work_session_slots where role_id=? and name=?', roleId, parts[parts.length - 1]);
      const slot = bySeq ?? byName;
      if (!slot) throw Error('ROLE_SLOT_NOT_FOUND');
      return slot;
    }
    throw Error('ROLE_SLOT_NOT_FOUND');
  }

  private joinView(binding: any, slot: any) {
    return {
      binding_id: binding.id,
      slot_id: slot.id,
      role_id: binding.role_id,
      work_session_id: binding.work_session_id,
      generation: binding.generation,
      state: binding.state,
      identity: this.identityPack(binding.role_id, slot, binding),
    };
  }

  private identityPack(roleId: string, slot: any, binding: any | null): RoleIdentityPack {
    const role = this.one(
      'select r.*,s.project_id,p.name project_name from roles r join spaces s on s.id=r.space_id join projects p on p.id=s.project_id where r.id=?',
      roleId,
    );
    if (!role) throw Error('ROLE_NOT_FOUND');
    const charter = this.one('select * from role_charters where role_id=? order by revision desc limit 1', roleId);
    const spec = charter ? JSON.parse(charter.spec_json) : {};
    const permissions = charter ? JSON.parse(charter.permissions_json) : [];
    const ws = this.one('select * from role_sessions where id=?', binding?.work_session_id ?? slot.work_session_id);
    return {
      project_id: role.project_id,
      project_display_name: role.project_name,
      role_id: roleId,
      slot_id: slot.id,
      slot_state: slot.state,
      work_session_id: ws?.id ?? null,
      work_session_state: ws?.state ?? null,
      short_ref: [role.project_id.slice(0, 8), role.name, 'W' + slot.seq].join(':'),
      display_name: spec.display_name ?? role.name,
      mission: spec.mission ?? role.description ?? '',
      responsibilities: spec.responsibilities ?? [],
      out_of_scope: spec.out_of_scope ?? spec.non_goals ?? [],
      current_assignment: spec.current_assignment ?? null,
      effective_permissions: permissions,
      default_result_target: spec.completion ?? spec.default_result_target ?? null,
      collaboration: spec.collaboration ?? null,
      identity_revision: Number(charter?.revision ?? 0),
      charter_revision: Number(charter?.revision ?? 0),
      permission_revision: Number(charter?.revision ?? 0),
      binding_generation: Number(slot.binding_generation),
      history_only: Boolean(ws && ws.state !== 'ACTIVE'),
      participant_kind: slot.participant_kind,
      safety_protocol: {
        request_key_required: true,
        history_read_only: true,
        cannot_expand_permissions: true,
        user_approval_must_not_be_fabricated: true,
      },
    };
  }
}
