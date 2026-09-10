# J2 截图说明

最终截图以 evidence/J2/desktop.json 的清单为准：每张包含源码 SHA、源码是否有未提交改动、LOCAL_CORE 模式、Electron 窗口像素尺寸、CSS viewport/DPR 和 zoom。使用 Electron webContents.capturePage 原生捕获，避免 Playwright 在缩放时的裁切。普通窗口为1440×900；缩放窗口为1280×720，125%/150%/200%。

覆盖空首页、手工方案、权限审阅、多组工作台、角色对话、SETTLING、150条历史、读取失败、角色配置、项目动态、运行环境、未知提交、缩放、断线与失败保留输入。LOCAL_CORE 配合受控 Fixture，模拟执行器不计真实 Harness。

阶段性 composer/layout 证据是当时的中间结果，部分旧截图采集有缩放裁切。failure.png 仅保留失败排查证据，不计为验收通过截图。最终报告只引用最终 desktop.json 清单，不用旧截图证明当前版本。
