# Changelog

## 1.1.0 — 2026-09-24

### Added

- Windows 本地 AgentRouter Core + Electron Workbench
- Role / WorkSession 正式模型
- Task / Run / Result / Artifact
- Result Evidence / Accept / Request Changes
- Management MCP
- Participant MCP / ChatGPT Web Participant
- Tailscale HTTPS/WSS Remote / Mobile console
- Codex / ZCode / Kimi Code / DSH / Pi Harness 接入
- WorkSession 历史只读与受控 Context/continuity
- Windows native process supervisor
- migration / recovery / idempotency / uncertain mutation safety

### Validated

- Codex 与 ZCode 最终产品候选真实执行
- 五 Harness Artifact → Result
- ChatGPT Web Participant
- iPhone Tailscale HTTPS/WSS smoke
- C1 / W11
- packaged fresh-unpack smoke
- publication refs / package sensitive scan

### Known limitations

- Codex → ZCode 完整历史迁移延期到 V1.2
- V1.1.0 为 unsigned portable ZIP
- 主入口文件名仍为 `electron.exe`
- signed installer / branded executable 延后
- full Narrator / exhaustive DPI-theme certification 延后
- Linux 最终发布收口延后
- account switching 不在 V1.1.0 范围

### Release artifact

`AgentRouter-v1.1.0-windows-x64-268fc71.zip`

SHA-256:

`6cd14621d24348c00d46c5995444e07ff7264e9591b8214ad8c9bdc0ac603604`
