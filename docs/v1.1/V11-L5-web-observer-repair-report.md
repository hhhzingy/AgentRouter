# V11-L5 手机只读链路修复记录

日期：2026-09-15。范围：Core observer 协议升级、Web 快照重连与失联显示；不是手机真机验收完成声明。

## 固定源码

- observer 修复：`6f67df0e320b2249e496e5865503aab8c95cc2d9`。
- Web 修复及本轮最终复测：`9014f9747b36b9c6d11beb9c9fe2abb56b9500c3`。
- 未更改冻结合同、历史 migration、账号认证、现有开发会话或 Tailscale 配置。

## 实现与证据边界

已鉴权 observer 可协商 C1R1P2，写操作仍拒绝。动态 Harness 投影测试通过公共 project/rolePlan API 建立角色，不通过 SQL 改 binding；这是离线 Core 测试，不是 ZCode 原生执行证据。

Web 串行轮询、合并并发快照请求；失联丢弃服务端成功缓存并关闭本连接，下一次连接重新读取 endpoint。浏览器检查 HTTP 状态与结构，显示最近更新时间，错误标记旧数据可能过期，不再把缺失 health 解释为 OK。响应仅选择显示字段，不透传完整 Core 对象。仅接受 GET，禁止缓存。

HTTP 测试从当前源码构建 Core/Web，在独立目录启动自身子进程，验证在线 200 与停止测试 Core 后 503；只停止自身子进程，保留测试目录。未验证真实手机、Tailscale Serve、浏览器布局或重启后的实际 endpoint 切换。重连行为目前由单元测试验证。

## 全部已知尝试分母

1. 前一轮 observer 测试两次失败：低层 fixture 的 snapshot 不满足合同，均为 INVALID_FRAME，尚未触达升级逻辑。
2. 本轮改用 application store fixture 并扩展公共计划 API 测试后，修复前 5 项中 3 失败、2 通过；3 项均复现 observer 升级 SCOPE_DENIED。
3. 修复后 5/5 通过；补未初始化/未授权且未初始化连接拒绝断言后再次 5/5 通过。未单独覆盖“已初始化但未授权”组合。
4. Web 快照单元测试首次 2/2 通过；同次类型检查失败两项：缺少 mjs 声明、mock 参数 tuple 类型。添加声明及参数类型后类型检查通过。
5. 首次当前源码 HTTP 联调 1 失败、快照单元 2 通过：构建未复制 migration 资源导致 Core 不可用、HTTP 503。补齐独立测试目录 migration 资源后 3/3 通过，类型检查通过。
6. 固定源码 SHA 最终运行上述四个测试文件，8/8 通过，类型检查通过。

lint、migration manifest/EOL、C1、C1R1、C1R1P1 freeze、diff 空白检查通过。提交钩子敏感内容扫描通过。

## 剩余工作

Core/data 身份显示、Host/Origin 限制、真实服务重启与 endpoint 切换、页面视觉/移动布局、Tailscale 私网 Serve 检查与精确 URL 操作卡仍待完成。未将 L5 或整个 66 项矩阵标为完成。账号切换仍为 EXCLUDED_BY_USER；不合 main、不 tag/release。
