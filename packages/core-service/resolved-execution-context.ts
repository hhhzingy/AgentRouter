/** C4/F12: Context Transfer 与 native 启动必须基于精确 Binding/profile/workspace/session，
 * 禁止按 harness 取配置文件里的第一个 profile。 */

export interface NativeProfileCandidate {
  id?: string;
  harness: string;
  sessionHome: string;
  providerId?: string;
  modelId?: string;
  effort?: string;
  workspace?: string;
}

export interface SessionHomeQuery {
  harness: string;
  roleId: string;
  side: 'source' | 'target';
  workspaceId?: string | null;
  sessionId?: string | null;
  profileRef?: string | null;
}

export interface ResolvedExecutionContext {
  harness: string;
  roleId: string;
  roleSessionId: string | null;
  workspaceId: string | null;
  workspacePath: string | null;
  bindingId: string | null;
  bindingEpoch: number | null;
  profileRef: string | null;
  sessionHome: string | null;
  nativeSessionRef: string | null;
}

type Db = {
  prepare: (sql: string) => { get: (...args: any[]) => any; all?: (...args: any[]) => any[] };
};

function parseConfig(json: string | null | undefined): {
  sessionHome?: string;
  workspace?: string;
  profileRef?: string;
  harness?: string;
} | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return {
      sessionHome: typeof parsed.sessionHome === 'string' ? parsed.sessionHome : undefined,
      workspace: typeof parsed.workspace === 'string' ? parsed.workspace : undefined,
      profileRef: typeof parsed.profileRef === 'string' ? parsed.profileRef : undefined,
      harness: typeof parsed.harness === 'string' ? parsed.harness : undefined,
    };
  } catch {
    return null;
  }
}

/** 同 harness 多个 profile 时必须能唯一收敛；禁止 profiles.find(harness) 取第一个。 */
export function uniqueProfileSessionHome(
  profiles: readonly NativeProfileCandidate[],
  harness: string,
  extras?: { workspace?: string | null; profileRef?: string | null },
): string | null {
  let matches = profiles.filter((p) => p.harness === harness && typeof p.sessionHome === 'string' && p.sessionHome.length > 0);
  if (extras?.profileRef) {
    const exact = matches.filter((p) => p.id === extras.profileRef);
    if (exact.length === 1) return exact[0].sessionHome;
    if (exact.length > 1) throw Error('NATIVE_PROFILE_AMBIGUOUS');
  }
  if (extras?.workspace) {
    const byWorkspace = matches.filter((p) => !p.workspace || p.workspace === extras.workspace);
    if (byWorkspace.length === 1) return byWorkspace[0].sessionHome;
    if (byWorkspace.length > 1) throw Error('NATIVE_PROFILE_AMBIGUOUS');
  }
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].sessionHome;
  throw Error('NATIVE_PROFILE_AMBIGUOUS');
}

export function resolveSourceExecutionContext(db: Db, roleId: string): ResolvedExecutionContext {
  const session = db.prepare("select * from role_sessions where role_id=? and state='ACTIVE' order by seq desc limit 1").get(roleId);
  const binding = db.prepare('select * from bindings where role_id=? and is_current=1').get(roleId);
  const workspace = binding
    ? db.prepare('select id,canonical_path from workspaces where id=?').get(binding.workspace_id)
    : undefined;
  let configRow: { config_json?: string } | undefined;
  if (binding) {
    configRow = db
      .prepare('select config_json from native_binding_configs where binding_id=? and epoch=?')
      .get(binding.id, binding.epoch);
  }
  if (!configRow && session?.id) {
    configRow = db
      .prepare(
        'select n.config_json from role_session_activations a join native_binding_configs n on n.binding_id=a.binding_id and n.epoch=a.binding_epoch where a.role_session_id=? order by a.activation_epoch desc limit 1',
      )
      .get(session.id);
  }
  const config = parseConfig(configRow?.config_json);
  return {
    harness: String(session?.harness ?? binding?.harness ?? ''),
    roleId,
    roleSessionId: session?.id ?? null,
    workspaceId: binding?.workspace_id ?? null,
    workspacePath: config?.workspace ?? workspace?.canonical_path ?? null,
    bindingId: binding?.id ?? null,
    bindingEpoch: binding?.epoch ?? null,
    profileRef: config?.profileRef ?? binding?.account_id ?? null,
    sessionHome: config?.sessionHome ?? null,
    nativeSessionRef: typeof session?.native_session_ref === 'string' ? session.native_session_ref : null,
  };
}

export function resolveTargetExecutionContext(
  db: Db,
  roleId: string,
  targetHarness: string,
  profiles: readonly NativeProfileCandidate[] = [],
): ResolvedExecutionContext {
  const source = resolveSourceExecutionContext(db, roleId);
  const sameHarness = source.harness === targetHarness;
  const sessionHome =
    uniqueProfileSessionHome(profiles, targetHarness, {
      workspace: source.workspacePath,
      profileRef: sameHarness ? source.profileRef : null,
    }) ?? (sameHarness ? source.sessionHome : null);
  const match = profiles.find((p) => p.harness === targetHarness && p.sessionHome === sessionHome);
  return {
    harness: targetHarness,
    roleId,
    roleSessionId: null,
    workspaceId: source.workspaceId,
    workspacePath: source.workspacePath,
    bindingId: sameHarness ? source.bindingId : null,
    bindingEpoch: sameHarness ? source.bindingEpoch : null,
    profileRef: match?.id ?? (sameHarness ? source.profileRef : null),
    sessionHome,
    nativeSessionRef: null,
  };
}

export function createNativeProfileSessionHomeResolver(
  db: Db,
  profilesOf: () => readonly NativeProfileCandidate[],
): (query: SessionHomeQuery) => string | null {
  return (query) => {
    if (query.side === 'source') {
      const source = resolveSourceExecutionContext(db, query.roleId);
      if (source.sessionHome) return source.sessionHome;
    }
    const source = resolveSourceExecutionContext(db, query.roleId);
    return uniqueProfileSessionHome(profilesOf(), query.harness, {
      workspace: source.workspacePath,
      profileRef: query.profileRef ?? (query.side === 'source' || query.harness === source.harness ? source.profileRef : null),
    });
  };
}
