import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, realpath, mkdir, writeFile, rm } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import type {
  SecureProcessHost,
  SecureNativeProcess,
} from '../core-service/native-process-backend.ts';
import type { StopEvidence } from '../core-service/execution-backend.ts';

type Start = Parameters<SecureProcessHost['start']>[0];
export interface PreparedWindowsNativeProcess {
  /** 完整的受信任环境；不与开发进程环境合并。 */
  env: NodeJS.ProcessEnv;
  /** 撤销本次桥令牌；必须幂等，不删除仍在运行的凭据目录。 */
  revoke?: () => void;
  /** 仅进程关闭后清理本次临时材料，必须幂等。 */
  dispose?: () => Promise<void>;
  extraArgs?: readonly string[];
  /** pi 由 Node 启动时，显式锁定 CLI 文件，而非把它误放到 RPC 参数之后。 */
  nodeEntrypoint?: { path: string; sha256: string };
  mcpServers?: unknown[];
  kimiConfiguration?: SecureNativeProcess['kimiConfiguration'];
  verifyCodex?: SecureNativeProcess['verifyCodex'];
  approveKimi?: SecureNativeProcess['approveKimi'];
  session?: SecureNativeProcess['session'];
  saveSession: SecureNativeProcess['saveSession'];
}

/** 显式 LIMITED_ISOLATION 的结构兼容宿主；仅 Job 生命周期认证，不声明全 OS 隔离。 */
export class WindowsNativeProcessHost implements SecureProcessHost {
  constructor(
    private readonly options: {
      isolation: 'LIMITED_ISOLATION';
      supervisorExecutable: string;
      supervisorSha256: string;
      managedRoot: string;
      stopTimeoutMs?: number;
      prepare: (input: Start) => Promise<PreparedWindowsNativeProcess>;
    },
  ) {}

  async start(input: Start): Promise<SecureNativeProcess> {
    const o = this.options;
    const c = input.config;
    const timeout = o.stopTimeoutMs ?? 5000;
    const base =
      c.harness === 'codex'
        ? ['app-server']
        : c.harness === 'kimi_code'
          ? ['acp']
          : ['--mode', 'rpc'];
    if (
      process.platform !== 'win32' ||
      o.isolation !== 'LIMITED_ISOLATION' ||
      ![o.supervisorExecutable, o.managedRoot, c.executable, c.workspace, c.sessionHome].every(
        isAbsolute,
      ) ||
      JSON.stringify(input.args) !== JSON.stringify(base) ||
      !Number.isSafeInteger(input.epoch) ||
      input.epoch < 0 ||
      !Number.isInteger(timeout) ||
      timeout < 1 ||
      timeout > 60000
    )
      throw Error('WINDOWS_NATIVE_HOST_INPUT_INVALID');
    const home = await realpath(c.sessionHome);
    const root = await realpath(o.managedRoot);
    const rel = relative(root, home);
    if (!rel || rel === '..' || rel.startsWith('..\\') || rel.startsWith('../') || isAbsolute(rel))
      throw Error('WINDOWS_NATIVE_HOME_OUTSIDE_MANAGED_ROOT');
    for (const [path, hash] of [
      [o.supervisorExecutable, o.supervisorSha256],
      [c.executable, c.executableSha256],
    ]) {
      if (
        !/^[a-f0-9]{64}$/i.test(hash) ||
        createHash('sha256')
          .update(await readFile(path))
          .digest('hex') !== hash.toLowerCase()
      )
        throw Error('WINDOWS_NATIVE_EXECUTABLE_HASH_MISMATCH');
    }
    // 先完成路径和二进制检查，再允许账号代理准备配置；此文件不读取凭据。
    const prepared = await o.prepare(input);
    try {
      const prefix: string[] = [];
      if (prepared.nodeEntrypoint) {
        const entry = prepared.nodeEntrypoint;
        if (
          c.harness !== 'pi' ||
          !isAbsolute(entry.path) ||
          !/^[a-f0-9]{64}$/i.test(entry.sha256) ||
          createHash('sha256')
            .update(await readFile(entry.path))
            .digest('hex') !== entry.sha256.toLowerCase()
        )
          throw Error('WINDOWS_NATIVE_ENTRYPOINT_INVALID');
        prefix.push(entry.path);
      }
      const env: NodeJS.ProcessEnv = {};
      for (const [key, value] of Object.entries(prepared.env)) {
        const upper = key.toUpperCase();
        if (/(MCP|NODE_OPTIONS|NODE_PATH|ELECTRON_RUN_AS_NODE)/.test(upper))
          throw Error('WINDOWS_NATIVE_ENV_FORBIDDEN');
        if (value !== undefined) env[upper] = value;
      }
      // 强制所有标准配置根指向绑定持久目录，不复用当前开发会话。
      Object.assign(env, {
        HOME: home,
        USERPROFILE: home,
        CODEX_HOME: join(home, '.codex'),
        KIMI_CODE_HOME: join(home, '.kimi-code'),
        PI_CODING_AGENT_DIR: join(home, '.pi'),
        APPDATA: join(home, 'AppData', 'Roaming'),
        LOCALAPPDATA: join(home, 'AppData', 'Local'),
        XDG_CONFIG_HOME: join(home, '.config'),
        TMP: join(home, 'tmp'),
        TEMP: join(home, 'tmp'),
        AGENTROUTER_MANAGED_ROLE: '1',
        AGENTROUTER_ISOLATION: 'LIMITED_ISOLATION',
      });
      env.PATH ??= join(home, 'bin');
      await mkdir(join(home, 'tmp'), { recursive: true });
      const stopFile = join(home, 'tmp', 'job-stop-' + randomUUID());
      const child = spawn(
        o.supervisorExecutable,
        [
          '--stop-file',
          stopFile,
          c.workspace,
          c.executable,
          ...prefix,
          ...base,
          ...(prepared.extraArgs ?? []),
        ],
        { cwd: c.workspace, env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
      );
      child.stdin.on('error', () => {});
      const closeListeners = new Set<() => void>();
      let didClose = false;
      const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
        (resolve) => {
          child.once('close', (code, signal) => {
            didClose = true;
            resolve({ code, signal });
            for (const listener of closeListeners) listener();
          });
        },
      );
      void closed
        .then(async () => {
          prepared.revoke?.();
          await prepared.dispose?.();
          await rm(stopFile, { force: true });
        })
        .catch(() => {});
      child.stderr.resume(); // 不记录未经脱敏的原生 stderr。
      await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', () => reject(Error('WINDOWS_NATIVE_START_FAILED')));
      });
      let stopping: Promise<StopEvidence> | undefined;
      const containmentId = `windows-job-${randomUUID()}`;
      return {
        session: prepared.session,
        mcpServers: prepared.mcpServers,
        approveKimi: prepared.approveKimi,
          kimiConfiguration: prepared.kimiConfiguration,
          verifyCodex: prepared.verifyCodex,
        saveSession: prepared.saveSession,
        write: (bytes) =>
          new Promise((resolve, reject) =>
            child.stdin.write(bytes, (error) =>
              error ? reject(Error('WINDOWS_NATIVE_WRITE_FAILED')) : resolve(),
            ),
          ),
        onData(listener) {
          child.stdout.on('data', listener);
          return () => child.stdout.off('data', listener);
        },
        onClose(listener) {
          closeListeners.add(listener);
          if (didClose)
            queueMicrotask(() => {
              if (closeListeners.has(listener)) listener();
            });
          return () => closeListeners.delete(listener);
        },
        stop() {
          return (stopping ??= (async () => {
            prepared.revoke?.();
            await writeFile(stopFile, 'STOP', { flag: 'wx' });
            child.stdin.end();
            let timer: ReturnType<typeof setTimeout> | undefined;
            const exit = await Promise.race([
              closed,
              new Promise<null>((resolve) => {
                timer = setTimeout(() => resolve(null), timeout);
              }),
            ]);
            if (timer) clearTimeout(timer);
            if (exit?.code === 0 && exit.signal === null)
              return { kind: 'supervisor-tree-empty', epoch: input.epoch, containmentId };
            if (!exit) child.kill();
            return { kind: 'unknown', epoch: input.epoch };
          })());
        },
      };
    } catch (error) {
      prepared.revoke?.();
      await prepared.dispose?.();
      throw error;
    }
  }
}
