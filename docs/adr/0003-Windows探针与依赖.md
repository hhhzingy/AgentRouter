# ADR 0003：Windows 探针与依赖版本

状态：探针选定，发布认证未完成。

系统 Node 24.14.0 与官方 win-x64 SHA-256 相符，复制为私有运行时；另带官方许可证。现有 pnpm 包装器使用 Codex 自带 Node 24.19.0，开发工具版本单独记录，不代替发布 Node 证据。

better-sqlite3 13.0.3 实测 SQLite 3.53.4，WAL/FULL/外键开启。官方 3.53.4 发布记录包含 WAL-reset 修复；本地探针仍不能证明断电可靠性。

本机没有 dotnet SDK/Windows SDK 探测结果，存在 .NET Framework csc。M00 使用 C# P/Invoke 构建 Job Object 可执行探针：CreateProcessW suspended → AssignProcessToJobObject → ResumeThread，KILL_ON_JOB_CLOSE，禁止 breakaway。该 helper 依赖目标 Windows .NET Framework，M07/M09 必须验证目标机依赖、嵌套 Job、IO 背压和应用主控失联。未完成前不把此探针宣称为发布级 native helper。

官方依据：
- https://nodejs.org/download/release/v24.14.0/SHASUMS256.txt
- https://sqlite.org/releaselog/3_53_4.html
- https://github.com/WiseLibs/better-sqlite3/releases
- https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects
- https://pnpm.io/settings

2026-09-09 核查的新增依赖为 package.json 的精确版本，传递依赖由 pnpm-lock.yaml 固定。pi 另以 npm lock 安装且禁用生命周期脚本。Electron 44 的二进制安装需显式运行 install.js，并使用 electron_config_cache 指定项目内缓存。
