# V1.1.0 Validation Summary

## Product SHA

`268fc71e81c2956ed1eeabf75df6389934836c09`

## CI

最终产品 SHA 的 C1 / W11 已成功。

## Golden flow

发布前同项目 Golden Flow PASS，覆盖：
- Codex Artifact → Result
- Electron Result review / Request Changes
- ZCode new WorkSession
- ZCode Artifact → Result
- Core cold restart
- old WorkSession read-only

## Harness

- Codex: final live PASS
- ZCode: final live PASS
- Pi: real Artifact→Result evidence
- Kimi: real Artifact→Result evidence，保留历史瞬态失败分母
- DSH: real Artifact→Result evidence，保留历史瞬态失败分母

## Participant / Mobile

- ChatGPT Web Participant happy path PASS
- iPhone Tailscale HTTPS/WSS smoke PASS

## Security

受测 publication refs/package 扫描范围为 0 findings。

该结论不代表任何未扫描本机私有 Git refs/object database 的绝对证明。
