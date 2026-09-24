import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type { StopEvidence } from '../core-service/execution-backend.ts';

/** 同用户有限隔离组件；不是 SecureProcessHost，不证明网络隔离或全进程树停止。 */
export async function startLimitedProcess(input: {
  executable: string;
  args: readonly string[];
  cwd: string;
  managedRoot: string;
  epoch: number;
}) {
  if (
    ![input.executable, input.cwd, input.managedRoot].every(isAbsolute) ||
    !Number.isSafeInteger(input.epoch) ||
    input.epoch < 0
  )
    throw Error('LIMITED_PROCESS_INPUT_INVALID');
  await mkdir(input.managedRoot, { recursive: true });
  const root = await realpath(input.managedRoot);
  // 每次全新目录；绝不复用开发会话或未知配置目录。
  const home = await mkdtemp(join(root, 'instance-'));
  const codexHome = join(home, '.codex');
  const temp = join(home, 'tmp');
  await Promise.all(
    [
      codexHome,
      temp,
      join(home, 'AppData', 'Roaming'),
      join(home, 'AppData', 'Local'),
      join(home, '.config'),
    ].map((p) => mkdir(p, { recursive: true })),
  );
  await writeFile(join(codexHome, 'config.toml'), '# AgentRouter managed LIMITED_ISOLATION\n', {
    flag: 'wx',
  });
  const env: NodeJS.ProcessEnv = {
    HOME: home,
    USERPROFILE: home,
    CODEX_HOME: codexHome,
    PATH: join(home, 'bin'),
    APPDATA: join(home, 'AppData', 'Roaming'),
    LOCALAPPDATA: join(home, 'AppData', 'Local'),
    XDG_CONFIG_HOME: join(home, '.config'),
    TMP: temp,
    TEMP: temp,
    AGENTROUTER_MANAGED_ROLE: '1',
    AGENTROUTER_ISOLATION: 'LIMITED_ISOLATION',
  };
  // 不传播 PATH、NODE_OPTIONS、代理、API Key、MCP 或任何开发工具环境。
  for (const name of ['SystemRoot', 'WINDIR', 'ComSpec']) {
    const key = Object.keys(process.env).find((k) => k.toLowerCase() === name.toLowerCase());
    if (key && process.env[key]) env[name] = process.env[key];
  }
  const child = spawn(input.executable, [...input.args], {
    cwd: input.cwd,
    env,
    shell: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  // write callbacks report EPIPE; consume the stream event so it cannot crash the parent.
  child.stdin.on('error', () => {});
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', () => reject(Error('LIMITED_PROCESS_START_FAILED')));
  });
  return {
    isolation: 'LIMITED_ISOLATION' as const,
    home,
    pid: child.pid!,
    stdout: child.stdout,
    stderr: child.stderr,
    closed,
    write(bytes: Buffer): Promise<void> {
      return new Promise((resolve, reject) => {
        child.stdin.write(bytes, (error) =>
          error ? reject(Error('LIMITED_PROCESS_WRITE_FAILED')) : resolve(),
        );
      });
    },
    endInput() {
      child.stdin.end();
    },
    async stop(): Promise<StopEvidence> {
      // 仅处理此实例的直接子进程，不按名称杀进程；即使退出也不能证明后代已停。
      if (child.exitCode === null && child.signalCode === null) child.kill();
      return { kind: 'unknown', epoch: input.epoch };
    },
  };
}
