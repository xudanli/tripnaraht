# 约束规则库

本目录包含RL Infrastructure的约束规则文件。

## 文件结构

- `geographic_rules.json` - 地理约束规则
- `temporal_rules.json` - 时间约束规则
- `compliance_rules.json` - 合规约束规则
- `user_preference_rules.json` - 用户偏好约束规则

## 规则格式

每个规则包含以下字段：

```json
{
  "rule_id": "规则ID",
  "type": "GEOGRAPHIC | TEMPORAL | COMPLIANCE | USER_PREFERENCE",
  "name": "规则名称",
  "description": "规则描述",
  "condition": {
    "字段名": {
      "操作符": "值"
    }
  },
  "severity": "HARD | SOFT",
  "sev_level": "SEV-1 | SEV-2 | SEV-3 | SEV-4",
  "action": "BLOCK | WARN | ALLOW",
  "metadata": {
    "category": "SAFETY | LEGAL | HEALTH | FINANCIAL | LOGISTICS"
  }
}
```

## 条件操作符

- `eq` - 等于
- `ne` - 不等于
- `in` - 在列表中
- `gt` - 大于
- `gte` - 大于等于
- `lt` - 小于
- `lte` - 小于等于
- `exists` - 存在

## 使用方法

约束规则由 `ConstraintRuleManagerService` 自动加载。可以通过环境变量 `CONSTRAINT_RULES_DIR` 指定规则目录，默认为 `./data/constraint-rules`。

## 扩展规则

1. 编辑对应的JSON文件
2. 添加新的规则对象
3. 确保格式正确
4. 重启服务以加载新规则（或调用 `ConstraintRuleManagerService.clearCache()`）

## 目标

- 地理约束规则：50+规则
- 时间约束规则：20+规则
- 合规约束规则：30+规则
- 用户偏好约束规则：动态规则

当前为示例规则，需要根据实际业务场景扩展。
