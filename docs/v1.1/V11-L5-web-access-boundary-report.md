# V11-L5 Web 访问边界与 Core 身份

日期：2026-09-15。固定源码：`b5f6c7f24cc4737c252d7525d1b3aa47345f30a6`。

## 本轮结果

- 精确校验本机 Host/端口；拒绝未知 Host、跨站 Origin、null Origin、cross-site 请求，不信任转发头授权。
- 私网 Serve origin 通过 `AGENTROUTER_WEB_SERVE_ORIGIN` 显式配置，必须是准确的 HTTPS ts.net origin。此校验不是 Tailscale 身份认证，也不代替 Serve 私网访问策略。
- Web 通过本机 desktopContext 获取数据集/Core 实例身份，必须与握手实例及观察者客户端一致；不一致时不请求快照，返回统一不可用错误。
- 页面显示数据集/Core 实例与更新时间；标题允许换行，卡片允许滚动与长字段换行。尚未进行实际浏览器视觉验收。

## 原始尝试与验证范围

1. Host/Origin 单元与当前源码 HTTP 测试：3/3 通过，类型检查通过。
2. 增加 Core 身份检查后，三个文件 6/6 通过，类型检查通过。
3. 增加 HTTP 级恶意 Host/Origin 403、POST 405、身份字段断言后，在上述干净源码 SHA 上五个文件 11/11 通过，类型检查通过。本轮无失败测试尝试；此前失败分母见上一份 Web observer 修复报告。
4. lint、migration manifest/EOL、C1/C1R1/C1R1P1 freeze、diff 检查及提交敏感内容扫描通过。

测试文件：web-access-policy、web-snapshot-source、web-console、web-observer-p2、contract-c1r1p2。HTTP 测试运行自身独立 Core/Web 子进程，不操作真实开发会话，测试目录保留。

## Tailscale 实测与未完成项

只读执行 `tailscale serve status --json` 得到 `{}`；`tailscale status --json` 的白名单字段显示 Running、Online=true。没有修改 Serve/Funnel/认证，未启用 URL；在线状态不构成手机可访问证据。

尚待：私网 Serve 实际代理、精确 URL 与测试项目/角色操作卡、手机真机、Core 重启后新 endpoint 的真实重连验证。ZCode/1M-token 压缩等全局剩余项不因本报告而完成。账号切换 EXCLUDED_BY_USER；不合 main、不 tag/release。
