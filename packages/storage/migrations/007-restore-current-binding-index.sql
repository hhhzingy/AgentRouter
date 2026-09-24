-- 007: 恢复 006 重建 bindings 时丢失的单一当前绑定唯一索引(F-01,向前修复)。
-- 若存量数据已含同角色多个 is_current=1(历史缺陷窗口期的产物),CREATE 显式失败并回滚版本记录,
-- 不自动挑选绑定或删除记录;由诊断工单处理冲突行。
CREATE UNIQUE INDEX one_current_binding_per_role ON bindings(role_id) WHERE is_current=1;
