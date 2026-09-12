import { createHash } from 'node:crypto';
import { Ajv2020 } from 'ajv/dist/2020.js';

export type ExternalApiResult = { state: 'SUCCEEDED'; output: unknown } | { state: 'UNKNOWN' };
/** Core-owned durable port. claim must atomically persist IN_FLIGHT before returning acquired. Never expire/reacquire an uncertain claim. */
export interface ExternalApiJournal {
  claim(
    key: string,
    fingerprint: string,
  ): Promise<
    { acquired: true } | { acquired: false; fingerprint: string; result?: ExternalApiResult }
  >;
  settle(key: string, fingerprint: string, result: ExternalApiResult): Promise<void>;
}
export interface ExternalApiAction {
  id: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  sideEffect: 'READ_ONLY' | 'WRITE' | 'DESTRUCTIVE';
  /** Trusted fixed adapter closure: owns registered endpoint, timeout and authentication. Never accepts transport parameters. */
  execute(args: Record<string, unknown>): Promise<unknown>;
  /** Must remove secret values before returning; raw response is never journaled or returned. */
  redact(raw: unknown): unknown;
}
export interface ExternalApiProfile {
  id: string;
  displayName: string;
  enabled: boolean;
  actions: readonly ExternalApiAction[];
}
const forbidden =
  /^(?:url|uri|endpoint|host|hostname|headers?|authorization|cookie|api[_-]?key|token|secret|secret_ref|password|method|path)$/i;
const canonical = (v: unknown): string =>
  Array.isArray(v)
    ? '[' + v.map(canonical).join(',') + ']'
    : v !== null && typeof v === 'object'
      ? '{' +
        Object.keys(v)
          .sort()
          .map((k) => JSON.stringify(k) + ':' + canonical((v as Record<string, unknown>)[k]))
          .join(',') +
        '}'
      : JSON.stringify(v);
function safeKeys(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(safeKeys);
  if (value !== null && typeof value === 'object')
    return Object.entries(value).every(([key, child]) => !forbidden.test(key) && safeKeys(child));
  return true;
}
function strictSchema(schema: unknown): void {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema))
    throw Error('API_SCHEMA_INVALID');
  const s = schema as Record<string, any>;
  if (s.$ref || s.$dynamicRef || s.patternProperties || s.unevaluatedProperties)
    throw Error('API_SCHEMA_INVALID');
  if (s.type === 'object' || s.properties) {
    if (s.type !== 'object' || s.additionalProperties !== false || !s.properties)
      throw Error('API_SCHEMA_NOT_CLOSED');
    for (const child of Object.values(s.properties)) strictSchema(child);
  }
  if (s.items) strictSchema(s.items);
  for (const key of ['allOf', 'anyOf', 'oneOf'])
    if (s[key]) for (const child of s[key]) strictSchema(child);
}
/** Instantiate in trusted Core, not the MCP process. Gateway integration must use the existing Client API. */
export class ExternalApiRegistry {
  private profiles = new Map<
    string,
    {
      metadata: { id: string; displayName: string };
      actions: Map<
        string,
        {
          action: ExternalApiAction;
          validate: ReturnType<Ajv2020['compile']>;
          output: ReturnType<Ajv2020['compile']>;
        }
      >;
    }
  >();
  constructor(
    profiles: readonly ExternalApiProfile[],
    private journal?: ExternalApiJournal,
  ) {
    const ajv = new Ajv2020({ strict: true, allErrors: false });
    for (const profile of profiles) {
      if (
        !/^[A-Za-z0-9_-]{1,96}$/.test(profile.id) ||
        !/^[\p{L}\p{N} _.-]{1,80}$/u.test(profile.displayName) ||
        this.profiles.has(profile.id)
      )
        throw Error('API_PROFILE_INVALID');
      if (!profile.enabled) continue;
      const actions = new Map();
      for (const action of profile.actions) {
        if (
          !/^[A-Za-z0-9_-]{1,96}$/.test(action.id) ||
          actions.has(action.id) ||
          !['READ_ONLY', 'WRITE', 'DESTRUCTIVE'].includes(action.sideEffect)
        )
          throw Error('API_ACTION_INVALID');
        strictSchema(action.inputSchema);
        strictSchema(action.outputSchema);
        if (action.inputSchema.type !== 'object') throw Error('API_SCHEMA_NOT_CLOSED');
        const snapshot = {
          ...action,
          inputSchema: structuredClone(action.inputSchema),
          outputSchema: structuredClone(action.outputSchema),
        };
        actions.set(action.id, {
          action: snapshot,
          validate: ajv.compile(snapshot.inputSchema),
          output: ajv.compile(snapshot.outputSchema),
        });
      }
      this.profiles.set(profile.id, {
        metadata: { id: profile.id, displayName: profile.displayName },
        actions,
      });
    }
  }
  list() {
    return [...this.profiles.values()].map((p) => ({
      ...p.metadata,
      actions: [...p.actions.keys()],
    }));
  }
  describe(profileId: string, actionId: string) {
    const action = this.find(profileId, actionId).action;
    return {
      profile_id: profileId,
      action_id: actionId,
      inputSchema: structuredClone(action.inputSchema),
      sideEffect: action.sideEffect,
      confirmationRequired: action.sideEffect !== 'READ_ONLY',
    };
  }
  private find(profileId: string, actionId: string) {
    const action = this.profiles.get(profileId)?.actions.get(actionId);
    if (!action) throw Error('API_ACTION_UNAVAILABLE');
    return action;
  }
  async call(
    input: {
      profile_id: string;
      action_id: string;
      args: Record<string, unknown>;
      request_key: string;
      confirm?: string;
    },
    journalOverride?: ExternalApiJournal,
  ) {
    const journal = journalOverride ?? this.journal;
    if (!journal) throw Error('API_JOURNAL_UNAVAILABLE');
    if (
      !input ||
      Object.keys(input).some(
        (k) => !['profile_id', 'action_id', 'args', 'request_key', 'confirm'].includes(k),
      ) ||
      !/^[A-Za-z0-9_.:-]{1,128}$/.test(input.request_key)
    )
      throw Error('API_INPUT_INVALID');
    const entry = this.find(input.profile_id, input.action_id);
    const json = JSON.stringify(input.args);
    if (!json || Buffer.byteLength(json) > 262144) throw Error('API_INPUT_INVALID');
    const args = JSON.parse(json);
    if (!safeKeys(args) || !entry.validate(args)) throw Error('API_INPUT_INVALID');
    const fingerprint = createHash('sha256')
      .update(canonical({ profile: input.profile_id, action: input.action_id, args }))
      .digest('hex');
    if (entry.action.sideEffect !== 'READ_ONLY' && input.confirm !== fingerprint)
      return {
        state: 'PREVIEW' as const,
        confirmation: fingerprint,
        profile_id: input.profile_id,
        action_id: input.action_id,
        sideEffect: entry.action.sideEffect,
      };
    const key = 'external_api:' + input.request_key;
    const claim = await journal.claim(key, fingerprint);
    if (!claim.acquired) {
      if (claim.fingerprint !== fingerprint) throw Error('API_REQUEST_KEY_CONFLICT');
      return claim.result ?? { state: 'UNKNOWN' as const };
    }
    let result: ExternalApiResult = { state: 'UNKNOWN' };
    try {
      const raw = await entry.action.execute(args);
      const output = entry.action.redact(raw);
      const safe = JSON.stringify(output);
      if (!safe || Buffer.byteLength(safe) > 1048576 || !safeKeys(output) || !entry.output(output))
        throw Error('API_OUTPUT_REJECTED');
      result = { state: 'SUCCEEDED', output: JSON.parse(safe) };
    } catch {
      /* Unknown side effects are never retried, including redaction/validation failure. */
    }
    try {
      await journal.settle(key, fingerprint, result);
    } catch {
      return { state: 'UNKNOWN' as const };
    }
    return result;
  }
}
