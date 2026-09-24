# P0 执行卡:Windows supervisor stdio 断裂阻塞全部 native harness live 路径

日期:2026-09-18。来源:WC01 zcode 一次性迁移 live run(WN 后续轮)真实装配时发现。
状态:**BLOCKED_NEW_DEFECT**(新发现现行缺陷;非回归,历史 DUT 通过的环境条件已漂移)。

## A. 现象(最小复现,全部本机实测)

supervisor.exe → node(任意脚本) 链下:
- 子进程 spawn/参数/Job 树停全部正常(文件写出 ✓);
- **子进程 stdin 立即 EOF、stdout 零字节**:`process.stdin.on('data')` 永不触发、`'end'` 立即触发;
- 同一脚本直 spawn(不经 supervisor)一切正常。
- 对产品的影响:zcode/pi/kimi/codex 的 charter bootstrap 与业务 run 均需经该链路 → 120s
  超时 FAILED(`BOOTSTRAP_EXECUTION_FAILED`,runs 不建,attempt pid 记录为 null)。

## B. 根因分析

Supervisor.cs `Std()` 用 `DuplicateHandle` 复制自身标准句柄再以 `STARTF_USESTDHANDLES`
交给孙进程。DuplicateHandle 出的 pipe 副本丢失 overlapped 语义,当前 node/libuv 对该句柄
的读取失败并被解释为 EOF。已实测并**回滚**的变体(均无效):
1. `GetStdHandle + SetHandleInformation(inherit)` 替代 DuplicateHandle;
2. 去掉 `STARTF_USESTDHANDLES` 改隐式继承;
3. 去掉 `CREATE_NO_WINDOW`。
结论:继承句柄路线不可修,必须让孙进程拿到 **libuv 自建兼容的 named pipe 句柄**。

## C. 推荐修复(最小,不动树停屏障语义)

supervisor 以 `CreateNamedPipe(FILE_FLAG_OVERLAPPED, bInheritHandle=TRUE)` 建三条
(named pipe 与 libuv 完全兼容,node 自身 spawn 即用此物),子进程 stdio=
`CreateFile` 的可继承客户端句柄;supervisor 端 `ConnectNamedPipe` 后在自身 stdin/stdout
与三条 named pipe 之间做字节搬运(线程或 overlapped)。`--stop-file`、Job、树停证明逻辑
一律不动。验收 = 本卡附带的探针 B(file→stdin/stdout 往返 `GOT:4`)与既有 supervisor
测试全绿,随后重放 WC01 live run。

## D. 已就位的配套修复与本轮已落地(同一分支)

1. `packages/platform/zcode-managed-profile.ts`:受管 config **双写**
   `~/.zcode/config.json` 与 `~/.zcode/cli/config.json` —— 0.16.5 同版本重打包后部分
   构建从前者的主配置布局读取;已实测双写后模型轮 `turn.terminal` 正常。
2. ZCode 0.16.5 重打包版 `zcode-builtin.json` 路径错位:CLI 找
   `dirname(cli)/provider/` 与盘根 `config/`,实际文件在 `resources/config/provider/`。
   解法(已实现于 `.local-protected/ztransfer-r1/setup.mjs`):CLI 与 builtin 配置一起
   复制进受管沙箱 `managed/zcode-cli/`,zcodeCli 指向沙箱副本;不改产品安装。
   实测:沙箱副本 + 直 spawn,session/create+send → turn.terminal 正常。
3. 装配脚本全套保留:`.local-protected/ztransfer-r1/{setup.mjs,run.mjs,transport.mjs,
   native-runtime.json,NOTES.md}` —— supervisor 修复合并后 `run.mjs` 直接重放即得
   LIVE_TESTED 证据(源任务→`roleSession.create(context_mode=inherit)`→
   `context_transfer_ops COMMITTED`→目标任务续作)。
4. P2 升级入口确认:`contract.upgrade → C1R1P2`(动态 HarnessId,zcode 不在 P1 冻结 enum)。
5. 附带发现:百炼标签凭据文件与 `prepareManagedZcodeProfile` 校验链(qwen3.8-flash)
   兼容 ✓;`native_binding_configs` 随 `role.createFromSpec/rolePlan.apply` 自动注册 ✓。

## E. 不变量(修复时不得破坏)

- Job KILL_ON_JOB_CLOSE + 树空证明(TREE_STOP_UNPROVEN)语义不变;
- 凭据仍只经 env 注入且不落 supervisor 日志/文件;
- `native-runtime.json` 的 sha 校验链(supervisor/executable/roleBridge)不变;
- 受管 HOME 沙箱边界(HOME=managed/<harness>)不变。
