# Linux 移植缝（W08，固定检查点视角）

共享检查点：分支 `feat/v1.1-final-windows-mobile`（合入以 CI 双门绿 + 人工评审为准，不自动 merge/tag）。
本文件只描述"哪里可以共用、哪里必须双线各自实现"，Linux 线不得复制 Windows 实现再双写共享层。

## 平台中立（直接共用，禁止分叉改动）

- `packages/remote/*`（Device Store 哈希存储、网关、node-ledger 抽象、device-extension）：0 处 win32 假设。
- `packages/client-transport/*`：C1R1P1/P2 帧、RemoteWebSocketTransport、P1 语义均与 OS 无关。
- `packages/storage`：migration 001—015 字节冻结（LF，`.gitattributes` 保证跨 checkout 校验和一致）。
- `packages/core-service`、`packages/security`、`packages/platform/{framing,stderr-ring,pi-provider-broker,labeled 凭据解析}`。
- `packages/remote/console.html`：手机 Web 控制台（HTTP/WSS 侧，天然跨平台）。

## Windows 专属（Linux 线不双写，只提供同接口实现）

- `packages/platform/windows-native-process-host.ts` + `native/windows-supervisor/Supervisor.cs`（Job Object、受限令牌）：
  实现 `execution-coordinator` 所需的受管进程面（spawn/停止证明/stderrTail/隔离档）。
  Linux 对应物应为同签名的 `linux-native-process-host`（process group + seccomp/landlock 或 bwrap 由 Linux 包定义），
  仅替换该模块与 `local-native-runtime` 中的受管 HOME/env 白名单装载点；不改协调器与合同。
- `kimi-managed-profile / zcode-managed-profile / codex-managed-profile` 中 `process.platform === 'win32'` 分支仅为路径大小写/分隔符归一，Linux 分支代码路径已存在（canonical()），无需新文件。

## 打包/运行环境差异（Linux 线各自维护）

- `tools/build-win.mjs` 的候选结构（resources/app + resources/w11-core + console.html + manifest 双模式）为模板；
  Linux 打包必须产出等价 `manifest.json`（backendModes=[LOCAL_CORE, REMOTE_CORE(opt-in)] + console sha），
  REMOTE 开关仍是同一组环境变量（AGENTROUTER_REMOTE_*）。
- 凭据文件（百炼标签格式 base_url/api_key/model=qwen3.8-flash）跨平台同形；keyring 差异在 Linux 线自定
  （node-ledger 的加密面已是 safeStorage 抽象，Linux 需接 libsecret/等价物——接口在 RemoteNodeLedger 构造函数注入处）。

## 验收复用

- `tests/{unit,integration,contract,chaos}` 四套为双线共同回归门（CI 同款命令）。
- `tests/live/*`：手机控制台 Playwright 用例与打包 REMOTE 用例跨平台可跑（依赖本机 chromium/core.mjs）；
  `tools/v11-fixed-load.mjs` 三轮固定负载脚本中 tasklist 取 RSS 一段是唯一 Windows 调用，Linux 替换为 /proc 读取即可。
