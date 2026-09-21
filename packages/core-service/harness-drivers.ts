import { CodexLifecycle } from '../adapters/codex/lifecycle.ts';
import { KimiLifecycle } from '../adapters/kimi/lifecycle.ts';
import { PiLifecycle } from '../adapters/pi/lifecycle.ts';
import { ZcodeLifecycle } from '../adapters/zcode/lifecycle.ts';
import { DshLifecycle } from '../adapters/dsh/lifecycle.ts';
import type { NativeRpcOptions } from '../adapters/shared/rpc-peer.ts';
import type { NativeBindingConfig } from './native-registry.ts';
import type { SecureNativeProcess } from './native-process-backend.ts';
import {
  capabilityRecord,
  unknownDriverContextCapabilities,
  validateDriverContextCapabilities,
  type DriverCapabilityEvidence,
  type DriverCapabilityRecord,
  type DriverContextCapabilities,
} from './driver-context-capabilities.ts';
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
  readonly driverVersion?: string;
  /** Static capability snapshot; UNKNOWN is the required default without evidence. */
  readonly contextCapabilities?: DriverContextCapabilities;
  readonly capabilityEvidence?: readonly DriverCapabilityEvidence[];
  probeContextCapabilities?(input: {
    config: Readonly<NativeBindingConfig>;
  }): Promise<DriverCapabilityRecord> | DriverCapabilityRecord;
  /** 受管进程的协议入口参数；隔离与凭据参数由宿主注入，不在此。 */
  processArgs(config: Readonly<NativeBindingConfig>): readonly string[];
  /** run 模式下除会话 id 外还必须持有原生会话文件路径（如 pi 的预留文件）。 */
  readonly requiresSessionPath: boolean;
  /** 无预载会话引用时允许全新会话(如 ACP session/new);缺省 run 必须携带可恢复引用。 */
  readonly supportsFreshSession?: boolean;
  /** WC02:同 ACTIVE WS 的原生连续性事实。UNSUPPORTED 时 backend 不得在同一 WS 上暗换 native ref,
   * preflight 必须引导用户新建 WorkSession(一次性迁移)。 */
  readonly continuity?: 'SAME_SESSION_CONTINUOUS' | 'SESSION_CONTINUATION_UNSUPPORTED';
  createLifecycle(input: {
    config: Readonly<NativeBindingConfig>;
    epoch: string;
    write: (bytes: Buffer) => Promise<void>;
    onEvent: (event: any) => void;
    promptTimeoutMs: number;
    onApproval?: NativeRpcOptions['onRequest'];
  }): HarnessLifecycle;
  /** 可选:run 模式任务轮的 prompt 组装。缺省为 request JSON 原文;
   * 供弱模型 harness 在 resume 会话中显式作废 bootstrap 一次性指令。 */
  runPrompt?(input: { request: unknown; charter: unknown; charterHash: string }): string;
}
export class HarnessDriverRegistry {
  private drivers = new Map<string, HarnessDriver>();
  private capabilityRecords = new Map<string, DriverCapabilityRecord>();

  register(driver: HarnessDriver): void {
    if (
      !driver ||
      !/^[a-z][a-z0-9_]{1,40}$/.test(driver.harness) ||
      this.drivers.has(driver.harness) ||
      typeof driver.processArgs !== 'function' ||
      typeof driver.createLifecycle !== 'function'
    )
      throw Error('DRIVER_REGISTRATION_INVALID');
    const capabilities = validateDriverContextCapabilities(
      driver.contextCapabilities ?? unknownDriverContextCapabilities(driver.harness, driver.driverVersion),
    );
    if (capabilities.harness !== driver.harness) throw Error('DRIVER_CAPABILITIES_HARNESS_MISMATCH');
    this.drivers.set(driver.harness, driver);
    this.capabilityRecords.set(driver.harness, capabilityRecord(capabilities, driver.capabilityEvidence));
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
  capabilities(harness: string): DriverCapabilityRecord {
    this.require(harness);
    const record = this.capabilityRecords.get(harness);
    if (!record) throw Error('DRIVER_CAPABILITIES_MISSING');
    return { capabilities: { ...record.capabilities }, evidence: [...record.evidence] };
  }
  async probeContextCapabilities(
    harness: string,
    input: { config: Readonly<NativeBindingConfig> },
  ): Promise<DriverCapabilityRecord> {
    const driver = this.require(harness);
    if (!driver.probeContextCapabilities) return this.capabilities(harness);
    const record = await driver.probeContextCapabilities(input);
    const capabilities = validateDriverContextCapabilities(record.capabilities);
    if (capabilities.harness !== harness) throw Error('DRIVER_CAPABILITIES_HARNESS_MISMATCH');
    return { capabilities, evidence: [...record.evidence] };
  }
}
export const codexDriver: HarnessDriver = {
  harness: 'codex',
  contextCapabilities: { ...unknownDriverContextCapabilities('codex'), native_resume: 'IMPLEMENTED_UNVERIFIED' },
  continuity: 'SAME_SESSION_CONTINUOUS',
  requiresSessionPath: false,
  supportsFreshSession: true,
  processArgs: () => ['app-server'],
  runPrompt({ request }) {
    return (
      '本轮任务请求:' + JSON.stringify(request) + '\n' +
      '执行协议:先按任务需要调用获授权的 Route 工具。route_context、route_send、route_wait、route_artifact_write、route_artifact_register、route_artifact_read 的成功都只是中间步骤,不会完成任务。' +
      '结束本轮原生 turn 前必须调用 route_finish 恰好一次提交终态;完成时提交 succeeded 及要求的 outputs,无法完成时也必须提交 failed 和诚实原因。route_finish 成功后立即停止。'
    );
  },
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
  contextCapabilities: { ...unknownDriverContextCapabilities('kimi_code'), native_resume: 'IMPLEMENTED_UNVERIFIED' },
  continuity: 'SAME_SESSION_CONTINUOUS',
  requiresSessionPath: false,
  supportsFreshSession: true,
  processArgs: () => ['acp'],
  runPrompt({ request, charter, charterHash }) {
    return (
      'Bootstrap 阶段已结束:此前"回复 ' + `AGENTROUTER_CHARTER_ACK:${charterHash}` + ' 一次"的指令已作废,本轮回复中不得再出现该确认,也不再禁止工具。\n' +
      '生效中的角色章程(须继续遵守):' + JSON.stringify(charter) + '\n' +
      '本轮任务请求:' + JSON.stringify(request) + '\n' +
      '执行协议:按任务需要调用获授权的 Route 工具。任何自然语言回答、route_context、route_send、route_wait、route_artifact_write、route_artifact_register、route_artifact_read 都不是任务终态。' +
      '在结束原生 turn 前必须调用 route_finish 恰好一次;成功时提交 succeeded 和任务要求的 outputs,无法完成时提交 failed 和诚实原因。route_finish 成功后停止。'
    );
  },
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
  contextCapabilities: { ...unknownDriverContextCapabilities('pi'), native_resume: 'IMPLEMENTED_UNVERIFIED' },
  continuity: 'SAME_SESSION_CONTINUOUS',
  requiresSessionPath: true,
  supportsFreshSession: true,
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
export const zcodeDriver: HarnessDriver = {
  harness: 'zcode',
  // 0.16.9 已提供正式 cold resume；实现已接线但必须等真实 DUT 后才能升级为 VERIFIED/PASS。
  contextCapabilities: { ...unknownDriverContextCapabilities('zcode'), native_resume: 'IMPLEMENTED_UNVERIFIED' },
  continuity: 'SAME_SESSION_CONTINUOUS',
  requiresSessionPath: false,
  supportsFreshSession: true,
  processArgs: () => {
    if (!zcodeCliRef.path) throw Error('ZCODE_CLI_UNCONFIGURED');
    return [zcodeCliRef.path, 'app-server'];
  },
  /** 同 dsh:冷进程 resume 不可用时新会话须重申章程并作废 bootstrap ACK。
   * WC02/SH-05:工具范围由角色有效权限决定,提示词不再硬编码只准 context/finish;
   * 仅提示 zcode 的 mcp__ 全限定命名规则。 */
  runPrompt({ request, charter, charterHash }) {
    return (
      'Bootstrap 阶段已结束:此前"回复 ' + `AGENTROUTER_CHARTER_ACK:${charterHash}` + ' 一次"的指令已作废,本轮回复中不得再出现该确认。\n' +
      '生效中的角色章程(须继续遵守):' + JSON.stringify(charter) + '\n' +
      '本轮任务请求:' + JSON.stringify(request) + '\n' +
      '可用工具以你的角色被授权的工具列表为准(Role MCP 工具带 mcp__agentrouter-role__ 前缀,任务文本提到的 route_context/route_finish 即指其中对应工具)。按任务需要使用获授权的工具完成并提交结果。'
    );
  },
  createLifecycle({ config, write, onEvent, promptTimeoutMs }) {
    const lifecycle = new ZcodeLifecycle({ write, onEvent,
      onDisconnect: reason => onEvent({ type: 'Disconnected', reason }), timeoutMs: promptTimeoutMs,
      // 托管角色权限白名单:仅 Route 工具(route_*)可 allow_once;其余走 deny option。
      onApproval: (params) => {
        const name = String((params as { toolName?: unknown })?.toolName ?? '');
        if (/route_(context|send|finish|wait|artifact_write|artifact_register|artifact_read)$/i.test(name)) return { decision: 'allow' };
        return { decision: 'deny' };
      } });
    return {
      get phase() {
        return lifecycle.phase;
      },
      async initialize() {
        await lifecycle.initialize();
      },
      async open({ config: cfg, process }) {
        if (!process.zcodeModelSelection) throw Error('ZCODE_MODEL_SELECTION_REQUIRED');
        if (process.session?.id) {
          await lifecycle.resume({ sessionId: process.session.id, workspacePath: cfg.workspace,
            workspaceKey: cfg.workspace, mcpServers: process.mcpServers });
          await lifecycle.subscribe();
          return { id: process.session.id };
        }
        const opened = await lifecycle.open({
          workspacePath: cfg.workspace,
          workspaceKey: cfg.workspace,
          mcpServers: process.mcpServers,
          model: process.zcodeModelSelection,
        });
        await lifecycle.subscribe();
        return { id: opened.id };
      },
      async start(input) {
        await lifecycle.start({ runId: input.runId, text: input.text });
      },
      async cancel() {
        await lifecycle.cancel();
        return { state: 'requested' };
      },
      accept: (bytes: Buffer) => lifecycle.accept(bytes),
      disconnect: () => lifecycle.disconnect(),
    };
  },
};
export const dshDriver: HarnessDriver = {
  harness: 'deepseek_harness',
  contextCapabilities: { ...unknownDriverContextCapabilities('deepseek_harness'), native_resume: 'IMPLEMENTED_UNVERIFIED' },
  continuity: 'SAME_SESSION_CONTINUOUS',
  requiresSessionPath: false,
  supportsFreshSession: true,
  processArgs: () => {
    if (!dshBinRef.path) throw Error('DSH_BIN_UNCONFIGURED');
    return [dshBinRef.path, '--profile', 'acp'];
  },
  /** resume 会话仍含 bootstrap 一次性 ACK 指令,弱模型会复读;任务轮显式作废并重申章程。 */
  runPrompt({ request, charter, charterHash }) {
    return (
      'Bootstrap 阶段已结束:此前"回复 '+`AGENTROUTER_CHARTER_ACK:${charterHash}`+' 一次"的指令已作废,本轮回复中不得再出现该确认,也不再禁止工具。\n' +
      '生效中的角色章程(须继续遵守):' + JSON.stringify(charter) + '\n' +
      '本轮任务请求:' + JSON.stringify(request) + '\n' +
      '直接执行该任务:先用 route_context 取上下文,业务结果用 route_finish 提交。'
    );
  },
  createLifecycle({ config, epoch, write, onEvent, promptTimeoutMs, onApproval }) {
    const lifecycle = new DshLifecycle({ epoch, write, onEvent, promptTimeoutMs, onApproval });
    return {
      get phase() {
        return lifecycle.phase;
      },
      async initialize() {
        await lifecycle.initialize();
      },
      async open({ config: cfg, process }) {
        const opened = await lifecycle.open({ cwd: cfg.workspace, nativeSessionId: process.session?.id, mcpServers: process.mcpServers });
        return { id: opened.id };
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
const zcodeCliRef: { path?: string } = {};
const dshBinRef: { path?: string } = {};

/** C4/3.8:每个 Harness 必须声明 COLD_RUN 或 WARM_SESSION。本轮全部 COLD_RUN。
 * ZCode 0.16.9 cold resume 已接线，但 Level B 仍须真实 DUT 后才能从 DECLARED_UNVERIFIED 升级。 */
export type HarnessLifecycleKind = 'COLD_RUN' | 'WARM_SESSION';
export interface HarnessLifecycleDeclaration {
  harness: string;
  lifecycle: HarnessLifecycleKind;
  continuity: 'SAME_SESSION_CONTINUOUS' | 'SESSION_CONTINUATION_UNSUPPORTED';
  native_resume: string;
  history_export: string;
  level_b: 'DECLARED_UNVERIFIED' | 'REQUIRES_NEW_WORKSESSION';
}
export function harnessLifecycleDeclaration(harness: string): HarnessLifecycleDeclaration {
  const driver = builtInDrivers().require(harness);
  const continuity = driver.continuity ?? 'SESSION_CONTINUATION_UNSUPPORTED';
  return {
    harness,
    lifecycle: 'COLD_RUN',
    continuity,
    native_resume: driver.contextCapabilities?.native_resume ?? 'UNKNOWN',
    history_export: driver.contextCapabilities?.history_export ?? 'UNKNOWN',
    level_b: continuity === 'SAME_SESSION_CONTINUOUS' ? 'DECLARED_UNVERIFIED' : 'REQUIRES_NEW_WORKSESSION',
  };
}

/** 受信宿主在安装运行时注入官方 CLI 入口;驱动只产协议参数。 */
export function builtInDrivers(cli?: { zcodeCli?: string; dshBin?: string }): HarnessDriverRegistry {
  zcodeCliRef.path = cli?.zcodeCli;
  dshBinRef.path = cli?.dshBin;
  const registry = new HarnessDriverRegistry();
  registry.register(codexDriver);
  registry.register(kimiDriver);
  registry.register(piDriver);
  registry.register(zcodeDriver);
  registry.register(dshDriver);
  return registry;
}
