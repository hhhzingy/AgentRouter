-- 010: Run 执行溯源与显式降级配置。
-- execution_provenance 由 Core 在 run 终态写入实际执行来源;模型/客户端声明不作为溯源。
-- fallback_json 为操作者显式登记的降级配置(如 Kimi 配额耗尽→DeepSeek),无配置即无降级。
alter table runs add column execution_provenance text;
alter table execution_profiles add column fallback_json text;
