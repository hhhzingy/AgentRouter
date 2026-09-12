import { CodexLifecycle } from '../adapters/codex/lifecycle.ts';
import { KimiLifecycle } from '../adapters/kimi/lifecycle.ts';
import { PiLifecycle } from '../adapters/pi/lifecycle.ts';
import type { NativeRpcOptions } from '../adapters/shared/rpc-peer.ts';
import type { NativeBindingConfig } from './native-registry.ts';
import type { SecureNativeProcess } from './native-process-backend.ts';
/** 统一生命周期/事件/能力面；各 Harness 的原生协议不同，由驱动适配。
 * 进程启动、凭据、停止证明仍归受信宿主，不进入驱动。 */
export interface HarnessLifecycle {
  /** 诊断用当前阶段；错误时随 diagnostic 上报。 */
  phase?: string;
  initialize?(): Promise<void>;
  /** 打开（新或恢复）原生会话；失败必须断开传输并抛错。返回待保存的原生会话引用。 */
  open(input: {
    config: Readonly<NativeBindingConfig>;
    process: SecureNativeProcess;
    instructions: string;
  }): Promise<{ id: string; path?: string }>;
  start(input: { runId: string; text: string; effort: string; epoch: string }): Promise<void>;
  cancel(epoch: string): Promise<{ state: string }>;
  /** 原始下行字节进入协议解析；仅传输层使用。 */
  accept(bytes: Buffer): void;
  disconnect(): void;
}
export interface HarnessDriver {
  readonly harness: string;
  /** 受管进程的协议入口参数；隔离与凭据参数由宿主注入，不在此。 */
  processArgs(config: Readonly<NativeBindingConfig>): readonly string[];
  /** run 模式下除会话 id 外还必须持有原生会话文件路径（如 pi 的预留文件）。 */
  readonly requiresSessionPath: boolean;
  createLifecycle(input: {
    config: Readonly<NativeBindingConfig>;
    epoch: string;
    write: (bytes: Buffer) => Promise<void>;
    onEvent: (event: any) => void;
    promptTimeoutMs: number;
    onApproval?: NativeRpcOptions['onRequest'];
  }): HarnessLifecycle;
}
export class HarnessDriverRegistry {
  private drivers = new Map<string, HarnessDriver>();
  register(driver: HarnessDriver): void {
    if (
      !driver ||
      !/^[a-z][a-z0-9_]{1,40}$/.test(driver.harness) ||
      this.drivers.has(driver.harness) ||
      typeof driver.processArgs !== 'function' ||
      typeof driver.createLifecycle !== 'function'
    )
      throw Error('DRIVER_REGISTRATION_INVALID');
    this.drivers.set(driver.harness, driver);
  }
  has(harness: string): boolean {
    return this.drivers.has(harness);
  }
  require(harness: string): HarnessDriver {
    const driver = this.drivers.get(harness);
    if (!driver) throw Error('NATIVE_HARNESS_UNSUPPORTED');
    return driver;
  }
  list(): string[] {
    return [...this.drivers.keys()].sort();
  }
}
export const codexDriver: HarnessDriver = {
  harness: 'codex',
  requiresSessionPath: false,
  processArgs: () => ['app-server'],
  createLifecycle({ config, write, onEvent, promptTimeoutMs }) {
    const lifecycle = new CodexLifecycle({ write, onEvent });
    return {
      get phase() {
        return lifecycle.phase;
      },
      async initialize() {
        await lifecycle.initialize();
      },
      async open({ config: cfg, process, instructions }) {
        if (!process.verifyCodex) throw Error('CODEX_NATIVE_VERIFIER_REQUIRED');
        await process.verifyCodex((method, params) => lifecycle.peer.request(method, params));
        const threadId = await lifecycle.open({
          cwd: cfg.workspace,
          model: cfg.modelId,
          instructions,
          nativeSessionId: process.session?.id,
        });
        return { id: threadId! };
      },
      async start(input) {
        await lifecycle.start({ runId: input.runId, text: input.text, effort: input.effort });
      },
      async cancel() {
        return lifecycle.cancel();
      },
      accept: (bytes: Buffer) => lifecycle.peer.accept(bytes),
      disconnect: () => lifecycle.peer.disconnect(),
    };
  },
};
export const kimiDriver: HarnessDriver = {
  harness: 'kimi_code',
  requiresSessionPath: false,
  processArgs: () => ['acp'],
  createLifecycle({ config, epoch, write, onEvent, promptTimeoutMs, onApproval }) {
    const lifecycle = new KimiLifecycle({
      epoch,
      write,
      onEvent,
      promptTimeoutMs,
      onApproval,
    });
    return {
      get phase() {
        return lifecycle.phase;
      },
      async initialize() {
        await lifecycle.initialize();
      },
      async open({ config: cfg, process }) {
        const opened = await lifecycle.open({
          cwd: cfg.workspace,
          nativeSessionId: process.session?.id,
          mcpServers: process.mcpServers,
        });
        const setting = process.kimiConfiguration;
        if (!setting) throw Error('KIMI_CONFIG_NOT_BOUND');
        await lifecycle.configure(setting.modelConfigId, cfg.modelId);
        await lifecycle.configure(setting.effortConfigId, cfg.effort);
        return { id: opened.sessionId };
      },
      async start(input) {
        await lifecycle.start({ runId: input.runId, text: input.text, epoch: input.epoch });
      },
      async cancel(epoch) {
        return lifecycle.cancel(epoch);
      },
      accept: (bytes: Buffer) => lifecycle.peer.accept(bytes),
      disconnect: () => lifecycle.peer.disconnect(),
    };
  },
};
export const piDriver: HarnessDriver = {
  harness: 'pi',
  requiresSessionPath: true,
  processArgs: () => ['--mode', 'rpc'],
  createLifecycle({ config, write, onEvent, promptTimeoutMs }) {
    const lifecycle = new PiLifecycle({ write, onEvent, promptTimeoutMs });
    return {
      get phase() {
        return lifecycle.phase;
      },
      async open({ config: cfg, process }) {
        const opened = await lifecycle.open({
          provider: cfg.providerId,
          modelId: cfg.modelId,
          thinkingLevel: cfg.effort,
          sessionPath: process.session?.path,
          expectedSessionId: process.session?.id,
        });
        return { id: opened.sessionId, path: opened.sessionFile };
      },
      async start(input) {
        await lifecycle.start({ runId: input.runId, text: input.text });
      },
      async cancel() {
        return lifecycle.cancel();
      },
      accept: (bytes: Buffer) => lifecycle.peer.accept(bytes),
      disconnect: () => lifecycle.peer.disconnect(),
    };
  },
};
export function builtInDrivers(): HarnessDriverRegistry {
  const registry = new HarnessDriverRegistry();
  registry.register(codexDriver);
  registry.register(kimiDriver);
  registry.register(piDriver);
  return registry;
}
