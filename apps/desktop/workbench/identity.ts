import type { ModelDescriptorVM, PlanModelSelection, WorkspaceVM, RoleCharterVM } from '../../../packages/client-contract/c1r1p1/generated.ts';
export type CoreIdentity = {mode:'LOCAL_CORE'|'REMOTE_CORE'|'PREVIEW_MOCK';dataId:string;clientId:string};
export function exactModel(catalog: ModelDescriptorVM[], selection: PlanModelSelection) {
 const matches = catalog.filter(m => m.harness === selection.harness && m.model_id === selection.model_id && (!selection.provider_profile_id || m.provider_profile_id === selection.provider_profile_id));
 return matches.length === 1 ? matches[0] : undefined;
}
export function exactWorkspace(workspaces: WorkspaceVM[], charter: RoleCharterVM | null, projectId?: string) {
 return charter && charter.projectId === projectId ? workspaces.find(w => w.id === charter.workspaceId && w.projectId === projectId) : undefined;
}
