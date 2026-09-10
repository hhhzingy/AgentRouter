/** 测试辅助：从 ui-mocks 数据同步构建可注入的 WorkbenchStore。 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  Capabilities,
  ConnectionState,
  SnapshotVM,
} from '../../packages/client-contract/c1r1p1/generated.ts';
import { baseCapabilities } from '../../packages/ui-mocks/client.ts';
import * as D from '../../packages/ui-mocks/data.ts';
import { StoreInjector, type WorkbenchStore } from '../../apps/desktop/workbench/store.tsx';

export function makeStore(overrides: {
  connectionState?: ConnectionState;
  capabilities?: Partial<Capabilities>;
  empty?: boolean;
  snapshot?: Partial<SnapshotVM>;
}): WorkbenchStore {
  const state = overrides.connectionState ?? 'CONNECTED_CONTROLLER';
  const snapshot: SnapshotVM = overrides.empty
    ? {
        cursor: 0,
        revision: 0,
        projects: [],
        spaces: [],
        roles: [],
        tasks: [],
        runs: [],
        issues: [],
        approvals: [],
        results: [],
        workspaces: [],
        modelCatalog: D.modelCatalog,
      }
    : {
        cursor: 108,
        revision: 100,
        projects: D.projects,
        spaces: D.spaces,
        roles: D.roles,
        tasks: D.tasks,
        runs: D.runs,
        issues: D.issues,
        approvals: D.approvals,
        results: D.results,
        workspaces: D.workspaces,
        modelCatalog: D.modelCatalog,
        ...(overrides.snapshot ?? {}),
      };
  return {
    hello: {
      serverInstanceId: 'test',
      serverVersion: '1.0.0-dev.0',
      protocol: 'agentrouter-client/1',
      schemaVersion: 3,
      platform: 'win32',
      connectionState: state,
      eventCursor: 108,
      capabilities: baseCapabilities(overrides.capabilities),
      health: state === 'DISCONNECTED' ? 'DEGRADED' : 'OK',
      upgradeRequired: false,
      lease: null,
    },
    snapshot,
    timeline: D.conversation,
    accounts: D.accountProfiles,
    quotas: D.quotas,
    connectionState: state,
    readOnly: state !== 'CONNECTED_CONTROLLER',
    readOnlyReason:
      state === 'DISCONNECTED'
        ? '连接已断开'
        : state === 'RECONNECTING' || state === 'DEGRADED'
          ? '重连中'
          : '观察者只读',
    capabilities: baseCapabilities(overrides.capabilities),
    frozenAtMs: D.FIXED_NOW,
    now: () => D.FIXED_NOW,
    call: () => Promise.reject(new Error('not implemented in static test')),
    refresh: () => Promise.resolve(),
    acquireControl: () => Promise.resolve(),
    releaseControl: () => Promise.resolve(),
  };
}

export function render(
  store: WorkbenchStore,
  element: React.ReactElement,
): string {
  return renderToStaticMarkup(<StoreInjector value={store}>{element}</StoreInjector>);
}

export const NOW = D.FIXED_NOW;
export { D };
