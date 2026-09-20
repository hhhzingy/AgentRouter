import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  uniqueProfileSessionHome,
  resolveSourceExecutionContext,
  createNativeProfileSessionHomeResolver,
} from '../../packages/core-service/resolved-execution-context.ts';
import { builtInDrivers, harnessLifecycleDeclaration } from '../../packages/core-service/harness-drivers.ts';

it('F12:同 harness 多个 profile 禁止取第一个，必须唯一收敛或 NATIVE_PROFILE_AMBIGUOUS', () => {
  const profiles = [
    { id: 'z1', harness: 'zcode', sessionHome: 'E:/homes/first' },
    { id: 'z2', harness: 'zcode', sessionHome: 'E:/homes/bound' },
  ];
  expect(() => uniqueProfileSessionHome(profiles, 'zcode')).toThrow('NATIVE_PROFILE_AMBIGUOUS');
  expect(uniqueProfileSessionHome(profiles, 'zcode', { profileRef: 'z2' })).toBe('E:/homes/bound');
  expect(uniqueProfileSessionHome(profiles, 'pi')).toBe(null);
  expect(uniqueProfileSessionHome([{ id: 'p1', harness: 'pi', sessionHome: 'E:/only' }], 'pi')).toBe('E:/only');
});

it('F12:来源 sessionHome 取当前 binding 的 native_binding_configs，不是配置数组第一项', () => {
  const rows: Record<string, any> = {
    session: { id: 'rsess_a', harness: 'zcode', native_session_ref: 'nat-a' },
    binding: { id: 'bnd_1', epoch: 3, harness: 'zcode', workspace_id: 'ws_1', account_id: 'z2' },
    workspace: { id: 'ws_1', canonical_path: 'E:/proj' },
    config: {
      config_json: JSON.stringify({
        harness: 'zcode',
        profileRef: 'z2',
        sessionHome: 'E:/homes/bound',
        workspace: 'E:/proj',
      }),
    },
  };
  const db = {
    prepare(sql: string) {
      return {
        get: (..._args: unknown[]) => {
          if (sql.includes('from role_sessions')) return rows.session;
          if (sql.includes('from bindings')) return rows.binding;
          if (sql.includes('from workspaces')) return rows.workspace;
          if (sql.includes('from native_binding_configs')) return rows.config;
          return undefined;
        },
      };
    },
  };
  const source = resolveSourceExecutionContext(db, 'role_1');
  expect(source.sessionHome).toBe('E:/homes/bound');
  expect(source.profileRef).toBe('z2');
  const resolver = createNativeProfileSessionHomeResolver(db, () => [
    { id: 'z1', harness: 'zcode', sessionHome: 'E:/homes/first' },
    { id: 'z2', harness: 'zcode', sessionHome: 'E:/homes/bound' },
  ]);
  expect(resolver({ harness: 'zcode', roleId: 'role_1', side: 'source' })).toBe('E:/homes/bound');
  expect(resolver({ harness: 'zcode', roleId: 'role_1', side: 'target', profileRef: 'z2' })).toBe('E:/homes/bound');
});

it('F13:运行时路径不再写入 RoleContext（sendUserInput/syncConversation/coordinator）', () => {
  const app = readFileSync('packages/core-service/application.ts', 'utf8');
  const coord = readFileSync('packages/core-service/execution-coordinator.ts', 'utf8');
  const main = readFileSync('apps/core-daemon/w11-main.ts', 'utf8');
  expect(app).not.toMatch(/contextStore\.appendConversation/);
  expect(coord).not.toMatch(/contextStore\.appendConversation/);
  expect(app).toMatch(/insert into conversation_items/);
  expect(main).not.toMatch(/profiles\.find\(\(x\) => x\.harness === harness\)/);
  expect(main).toMatch(/createNativeProfileSessionHomeResolver/);
});

it('F15/C4:五 Harness 均为 COLD_RUN；ZCode Level B 要求新 WS 且不得暗换 native session', () => {
  const registry = builtInDrivers();
  for (const harness of registry.list()) {
    const d = harnessLifecycleDeclaration(harness);
    expect(d.lifecycle).toBe('COLD_RUN');
    expect(d.harness).toBe(harness);
  }
  const zcode = harnessLifecycleDeclaration('zcode');
  expect(zcode.continuity).toBe('SESSION_CONTINUATION_UNSUPPORTED');
  expect(zcode.native_resume).toBe('UNSUPPORTED');
  expect(zcode.level_b).toBe('REQUIRES_NEW_WORKSESSION');
  expect(harnessLifecycleDeclaration('codex').level_b).toBe('DECLARED_UNVERIFIED');
  const backend = readFileSync('packages/core-service/native-process-backend.ts', 'utf8');
  expect(backend).toMatch(/continuityRefSaved/);
  expect(backend).toMatch(/SESSION_CONTINUATION_UNSUPPORTED/);
});
