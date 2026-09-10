import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { JsonLfDecoder } from '../platform/framing.ts';
import type { ExecutionBackend, ExecutionExit } from './execution-backend.ts';
/** 只执行仓库内受控 Fixture；父进程退出证据仅可用于 Fixture，绝非真实进程树认证。 */
export class FixtureBackend implements ExecutionBackend {
  private children = new Map<string, ChildProcessWithoutNullStreams>();
  constructor(readonly executable: string) {}
  launch(
    key: string,
    packet: { epoch: number; [key: string]: unknown },
    onFrame: (event: any) => void,
    onExit: (exit: ExecutionExit) => void,
    onBroken = () => {},
  ) {
    const child = spawn(process.execPath, [this.executable], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
      },
    });
    this.children.set(key, child);
    const decoder = new JsonLfDecoder();
    child.stdout.on('data', (b) => {
      try {
        for (const e of decoder.push(b)) onFrame(e);
      } catch {
        onBroken();
        child.kill();
      }
    });
    child.stderr.on('data', () => {});
    let ended = false;
    const exit = (code: number | null) => {
      if (ended) return;
      ended = true;
      this.children.delete(key);
      try {
        decoder.end();
      } catch {
        onBroken();
      }
      onExit({ code, stop: { kind: 'fixture-parent-exit', epoch: packet.epoch } });
    };
    child.on('error', () => exit(null));
    child.on('close', exit);
    child.stdin.on('error', () => {
      onBroken();
      child.kill();
    });
    child.stdin.write(JSON.stringify(packet) + '\n');
    return child;
  }
  cancel(key: string, epoch: number) {
    const child = this.children.get(key);
    if (!child || child.stdin.destroyed || !child.stdin.writable) return false;
    child.stdin.write(JSON.stringify({ cancel: true, epoch }) + '\n');
    return true;
  }
  async stop() {
    const children = [...this.children.values()];
    await Promise.all(
      children.map(
        (child) =>
          new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 2000);
            child.once('close', () => {
              clearTimeout(timer);
              resolve();
            });
            child.kill();
          }),
      ),
    );
  }
}
