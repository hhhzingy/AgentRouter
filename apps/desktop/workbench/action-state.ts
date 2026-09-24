export type ActionState = 'idle' | 'submitting' | 'succeeded' | 'failed' | 'uncertain';
export function failureState(error: unknown): ActionState {
 const e = error as {category?: string; message?: string};
 return e.category === 'AMBIGUOUS' || ['REQUEST_TIMEOUT','CONNECTION_LOST'].includes(e.message ?? '') ? 'uncertain' : 'failed';
}
export function actionTone(state: ActionState) { return state === 'succeeded' ? 'ok' : state === 'uncertain' ? 'warning' : state === 'failed' ? 'danger' : 'neutral'; }
export function errorMessage(error: unknown) {
 const code = error instanceof Error ? error.message : String(error);
 const messages: Record<string,string> = {REQUEST_TIMEOUT:'提交结果尚未确认，请核对后按原操作重试。',CONNECTION_LOST:'连接已断开，提交结果可能需要核对。',PENDING_SLOT_NEEDS_REVIEW:'已有结果未明的 Slot 操作；请先在待核对提交中按原操作重试或核对，不要发起新的 Slot 变更。',CONTROL_LEASE_REQUIRED:'请先申请控制权。',CONTROL_LEASE_EXPIRED:'控制权已过期，请重新申请。',CAPABILITY_UNAVAILABLE:'当前 Core 尚不支持此操作。',SCOPE_DENIED:'该对象不在当前授权范围。',REVISION_CONFLICT:'数据已更新，请刷新并重新检查。',INVALID_PARAMS:'内容或引用无效，请检查输入。'};
 return messages[code] ?? '操作未完成，请检查输入或展开技术详情。';
}
