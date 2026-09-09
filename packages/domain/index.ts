import { RouteError } from '../protocol/index.ts';
export const taskTransitions: Record<string, readonly string[]> = {
  QUEUED: ['ACTIVE', 'CANCELLED', 'SUSPENDED'],
  ACTIVE: ['WAITING_INPUT', 'RESULT_STAGED', 'NEEDS_ATTENTION', 'SUSPENDED'],
  WAITING_INPUT: ['ACTIVE', 'RESULT_STAGED', 'NEEDS_ATTENTION', 'SUSPENDED'],
  RESULT_STAGED: ['DELIVERED', 'HANDED_OFF', 'PARTIAL', 'FAILED', 'CANCELLED', 'NEEDS_ATTENTION'],
  NEEDS_ATTENTION: ['SUSPENDED'],
  SUSPENDED: ['QUEUED'],
  DELIVERED: [],
  HANDED_OFF: [],
  PARTIAL: [],
  FAILED: [],
  CANCELLED: [],
};
export function assertTransition(from: string, to: string) {
  if (!taskTransitions[from]?.includes(to))
    throw new RouteError('ILLEGAL_TASK_TRANSITION', 'CONFLICT');
}
export const tools = [
  'route_context',
  'route_send',
  'route_finish',
  'route_wait',
  'route_artifact_register',
  'route_artifact_read',
] as const;
export function certifyCapabilities(cap: Record<string, unknown>) {
  for (const k of ['sessionCreate', 'toolBridge', 'cancel', 'settledSignal'])
    if (cap[k] !== 'supported') throw new RouteError(`CAPABILITY_UNVERIFIED:${k}`, 'UNAVAILABLE');
}
