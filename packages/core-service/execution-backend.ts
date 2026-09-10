/** 仅 Core 内部可信后端可提交；不得从模型输出、Client API 或普通 JSON 反序列化。 */
export type StopEvidence =
  | { kind: 'fixture-parent-exit'; epoch: number }
  | { kind: 'supervisor-tree-empty'; epoch: number; containmentId: string }
  | { kind: 'unknown'; epoch: number };
export interface ExecutionExit {
  code: number | null;
  stop: StopEvidence;
}
export interface ExecutionBackend {
  launch(
    key: string,
    packet: { epoch: number; [key: string]: unknown },
    onFrame: (event: any) => void,
    onExit: (exit: ExecutionExit) => void,
    onBroken?: () => void,
  ): { pid?: number };
  /** 只返回是否提交到本地写入缓冲区；不代表原生已接收或取消已完成，也不释放租约。 */
  cancel(key: string, epoch: number): boolean;
  stop(): Promise<void>;
}
/** 原生 terminal 与进程停止是两个独立条件；本函数仅核验后者。 */
export function completionAllowed(
  exit: ExecutionExit,
  epoch: number,
  fixtureMode: boolean,
): boolean {
  if (exit.stop.epoch !== epoch) return false;
  if (exit.stop.kind === 'fixture-parent-exit') return fixtureMode;
  return exit.stop.kind === 'supervisor-tree-empty' && exit.stop.containmentId.trim().length > 0;
}
