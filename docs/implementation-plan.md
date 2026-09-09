# AgentRouter V1.0 实施计划与需求追踪

原始开发包为冻结输入；功能 F01—F26 不删减。测试状态以 evidence 中实际执行记录为准。

| 功能 | 名称 | 模块 | 阶段 | 测试 | 完整验收状态 |
|---|---|---|---|---|---|
| F01 | 环境检测 | platform | M00, M09 | T001, T002, T079, T081 | NOT_RUN |
| F02 | 项目管理 | domain | M06 | T003, T004 | NOT_RUN |
| F03 | 协作空间 | domain | M07 | T005 | NOT_RUN |
| F04 | 角色管理 | domain | M06 | T006 | NOT_RUN |
| F05 | Harness 与模型 | adapters | M00, M03, M04, M05, M09 | T002, T007, T008, T009, T075, T077, T081 | NOT_RUN |
| F06 | 独立会话 | adapters | M03, M04, M05 | T010, T011, T012 | NOT_RUN |
| F07 | 更换绑定与交接 | runtime | M06 | T013, T014 | NOT_RUN |
| F08 | 项目协议 | protocol | M01, M06 | T015, T016, T017 | NOT_RUN |
| F09 | 任务请求 | runtime | M01, M02, M03, M09 | T018, T019, T020, T021, T078, T080 | NOT_RUN |
| F10 | 结果与接力 | runtime | M01, M02, M05, M07 | T022, T023, T024, T025, T026, T027, T028, T076 | NOT_RUN |
| F11 | 普通通知 | runtime | M02 | T029 | NOT_RUN |
| F12 | 排队与续办 | runtime | M02, M04, M05, M09 | T030, T031, T032, T033, T034, T076, T077, T080 | NOT_RUN |
| F13 | 并行与工作区 | artifacts | M06 | T004, T035, T036, T037, T038 | NOT_RUN |
| F14 | 资料与产物 | artifacts | M06 | T039, T040, T041, T042, T043 | NOT_RUN |
| F15 | 角色对话页 | desktop | M05, M07, M09 | T012, T044, T045, T075, T080 | NOT_RUN |
| F16 | 协作时间线 | desktop | M07 | T046, T047 | NOT_RUN |
| F17 | 结果与问题中心 | desktop | M07 | T028, T048 | NOT_RUN |
| F18 | Codex 账号 | accounts | M08 | T049, T050, T051, T052, T054, T055 | NOT_RUN |
| F19 | Kimi Code 账号 | accounts | M08 | T053, T054, T055 | NOT_RUN |
| F20 | pi 提供商配置 | accounts | M05 | T009, T056 | NOT_RUN |
| F21 | 执行保护 | runtime | M02 | T057, T058, T059 | NOT_RUN |
| F22 | 生命周期 | platform | M07, M09 | T060, T061, T062, T063, T079 | NOT_RUN |
| F23 | 持久化与恢复 | storage | M00, M02, M05, M06, M07, M09 | T014, T020, T021, T025, T047, T064, T065, T066, T067, T075, T080 | NOT_RUN |
| F24 | 导出与维护 | storage | M08, M09 | T068, T069, T070, T079 | NOT_RUN |
| F25 | 安全与授权 | role-bridge | M01, M02, M03, M05, M06, M07, M09 | T017, T033, T042, T063, T071, T072, T073, T078, T081 | NOT_RUN |
| F26 | 外部扩展预留 | protocol | M09 | T074 | NOT_RUN |

M00 先建立版本、协议与打包探针；M01 完成协议/领域/数据库；M02 完成模拟调度/故障；M03—M05 按 Codex、Kimi、pi 接入真实协议；M06 工作区/产物/规则；M07 桌面/Windows 生命周期；M08 账号/备份；M09 完整发布验收。任何阶段的独立离线工作可以继续，但不得跨过失败依赖 Gate 宣告完成。
