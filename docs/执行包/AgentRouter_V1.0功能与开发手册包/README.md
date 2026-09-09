# AgentRouter V1.0 文档与实施包

日期：2026-09-09。面向 Windows x64；Harness 为 Codex、Kimi Code、pi。本文档包定义产品与实施基线，**不是可运行应用或真实联调通过报告**。

## 人类阅读

`AgentRouter_V1.0_功能手册.docx`（或 `01_功能手册.md`）：产品介绍、26 项功能、操作行为、状态、边界和故障处理。

`AgentRouter_V1.0_开发手册.docx`（或 `02_开发手册.md`）：技术可行性、稳定性、适配器、数据库/状态、Windows、安全和 M00—M09 开发顺序。

## 交给 Codex

将整个包放入项目文档目录，并让 Codex 从 `08_Codex实施入口.md` 开始。Markdown 是便于检索和版本管理的文本基线；Word 是对应的人类阅读排版版。仅给 Word 会缺少机器规范和可运行的离线校验脚本。

## 配套材料

`03_总协议与工具契约.md`；`04_验收与追踪矩阵.md`；`05_AI编排指南.md`；`06_项目规则模板.yaml`；`07_研究依据与版本核查.md`。

`spec/`：JSON Schema、SQL 基线、TypeScript 适配契约、默认值、81 项计划测试和来源索引。

`examples/`：7 个合法示例与 3 个应拒绝的反例。

`templates/compatibility-lock.template.json`：留空的真实环境验证记录，禁止将研究日期冒充测试日期。

## 离线规范检查

需要 Python 3.10+、jsonschema、PyYAML。先明确安装依赖，再运行：

```sh
python -m pip install jsonschema PyYAML
python tools/validate_spec.py
```

类型契约可使用已安装的 TypeScript 检查：

```sh
tsc --noEmit --strict --lib ES2022,DOM spec/adapter-contract.d.ts
```

这些命令只检查文档辅助规范、示例和数据库声明约束，不启动真实 AgentRouter，不调用任何 Harness，不验证 Windows/账号/进程/模型能力。执行结果在 `validation/`。

## 使用原则

产品编排由人或指定 AI 决定；程序负责可信身份、协议、消息、队列、结果和恢复。成功无业务回执，结果只送指定目标，原生收尾后才释放后续工作。未来外部 MCP/插件/API 管理仅预留；内部角色工具桥是 V1.0 必需能力。

实现前再次核查官方接口与安全状态，固定受测版本。所有现场与发布验收目前为 NOT_RUN，必须由实施阶段真实执行。
