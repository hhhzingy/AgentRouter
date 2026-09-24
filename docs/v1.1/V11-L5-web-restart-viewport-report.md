# V11-L5 Core 重启与移动视口回归

日期：2026-09-15；固定源码 SHA：`7e69ae4042f8d13b0e0ed9f0ae732725407fad04`。

## 实测

HTTP 集成测试从当前源码构建独立 Core/Web，在线返回 200；停止仅由测试启动的 Core 后返回 503；以同一测试数据目录启动新 Core，Web 通过重新握手恢复 200。数据集 ID 不变，Core 实例 ID 改变，更新时间增加。检查 HTTP Host/Origin 403、POST 405 等既有断言继续通过。未操作用户开发进程。

移动视口脚本现从当前源码构建 Core 并复制 migration 资源，不使用旧 bundle；要求页面确实显示 Core 已连接和数据集身份，不允许空错误页仅凭布局过关。

固定 SHA 产物：`.local/w11-tests/mob-dfFQRn/mobile-report.json`，同目录 `iPhone-13.png` 与 `Pixel-7.png`。两种 Chromium 视口均无水平溢出，四个列表与身份可见。首次未提交版本截图亦已人工查看。设备名只是视口预设，并非真实 iPhone/Pixel、WebKit 或 OS 模拟器。

## 尝试分母

- 增加重启断言后首次 HTTP 集成：1/1 通过；类型检查通过。
- 更新视口脚本后首次运行：2/2 视口通过，产物 `.local/w11-tests/mob-ge9N77`。
- 上述固定 SHA 复测：HTTP 1/1、视口 2/2 通过。本轮无失败测试尝试。
- Core 恢复期间有界轮询允许 503，这是测试的预期状态转换，不是重跑整个用例筛选 PASS。

## 未完成与环境

测试用独立空数据集，不证明动态角色的真实任务流转。完整手机操作卡仍缺受管角色场景、运行中的专用部署与同 URL 私网 HTTPS 自检。未启用 Serve、Funnel 或公网端口。未给用户占位 URL；后续准备齐全后才交付真实可点击 URL。

测试结束仅停止自身子进程，保留数据与截图，不删除文件。全局目标继续；账号切换 EXCLUDED_BY_USER，不合 main、不 tag/release。
