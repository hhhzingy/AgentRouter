import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { startLimitedProcess } from './limited-process-host.ts';
import type { StopEvidence } from '../core-service/execution-backend.ts';

/** 受信任调用方锁定 supervisor 二进制；只证明 Job 收尾，不提升秘密或网络隔离等级。 */
export async function startContainedLimitedProcess(
  input: Parameters<typeof startLimitedProcess>[0] & {
    supervisorExecutable: string;
    supervisorSha256: string;
    stopTimeoutMs?: number;
  },
) {
  if (process.platform !== 'win32') throw Error('CONTAINED_PROCESS_WINDOWS_REQUIRED');
  const timeout = input.stopTimeoutMs ?? 15000;
  if (
    !isAbsolute(input.supervisorExecutable) ||
    !isAbsolute(input.executable) ||
    !/^[a-f0-9]{64}$/i.test(input.supervisorSha256) ||
    !Number.isSafeInteger(timeout) ||
    timeout < 1 ||
    timeout > 60000
  )
    throw Error('CONTAINED_PROCESS_INPUT_INVALID');
  const actual = createHash('sha256')
    .update(await readFile(input.supervisorExecutable))
    .digest('hex');
  if (actual !== input.supervisorSha256.toLowerCase()) throw Error('SUPERVISOR_HASH_MISMATCH');
  const child = await startLimitedProcess({
    ...input,
    executable: input.supervisorExecutable,
    args: [input.cwd, input.executable, ...input.args],
  });
  const containmentId = `windows-job-${randomUUID()}`;
  let stopping: Promise<StopEvidence> | undefined;
  return {
    ...child,
    containmentId,
    stop(): Promise<StopEvidence> {
      if (stopping) return stopping;
      stopping = (async () => {
        child.endInput();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const exit = await Promise.race([
          child.closed,
          new Promise<null>((resolve) => {
            timer = setTimeout(() => resolve(null), timeout);
          }),
        ]);
        if (timer) clearTimeout(timer);
        if (exit?.code === 0 && exit.signal === null)
          return { kind: 'supervisor-tree-empty', epoch: input.epoch, containmentId };
        if (!exit) await child.stop();
        return { kind: 'unknown', epoch: input.epoch };
      })();
      return stopping;
    },
  };
}
