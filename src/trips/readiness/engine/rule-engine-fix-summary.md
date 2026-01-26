# Rule Engine 错误修复总结

## 问题描述

错误信息：
```
Cannot read properties of undefined (reading 'all')
TypeError: Cannot read properties of undefined (reading 'all')
    at RuleEngine.evaluate (/home/devbox/project/src/trips/readiness/engine/rule-engine.ts:18:19)
```

## 根本原因

在 `RuleEngine.evaluate` 方法中，当 `condition` 参数为 `undefined` 或 `null` 时，代码直接访问 `condition.all`，导致运行时错误。

虽然 `Rule` 接口定义中 `when` 字段是必需的，但在某些情况下（如数据不完整、迁移过程中等），`rule.when` 可能为 `undefined`。

## 修复方案

### 1. 修复 `rule-engine.ts`

在 `evaluate` 方法开始处添加空值检查：

```typescript
evaluate(condition: Condition | undefined | null, context: TripContext): boolean {
  // 如果条件为空，默认返回 false（不触发规则）
  if (!condition) {
    return false;
  }
  
  // ... 原有逻辑
}
```

### 2. 修复 `readiness-checker.ts`

在评估规则前检查 `when` 字段是否存在：

```typescript
// 如果规则没有 when 条件，跳过（或根据业务逻辑决定是否触发）
if (!rule.when) {
  // 如果没有条件，可以选择跳过或默认触发
  // 这里选择跳过，因为通常规则应该有明确的条件
  continue;
}
```

### 3. 更新类型定义

将 `Rule` 接口中的 `when` 字段改为可选：

```typescript
export interface Rule {
  // ...
  when?: Condition;  // 可选：如果规则总是触发，可以没有 when 条件
  then: Action;
  // ...
}
```

## 修复效果

- ✅ 防止运行时错误：当 `condition` 为 `undefined` 时，返回 `false` 而不是抛出错误
- ✅ 提高健壮性：即使数据不完整，系统也能正常运行
- ✅ 向后兼容：不影响现有正常工作的规则

## 测试建议

1. 测试正常规则（有 `when` 条件）
2. 测试缺少 `when` 条件的规则（应该被跳过）
3. 测试 `when` 为 `null` 的情况
4. 测试空条件对象 `{}` 的情况

## 相关文件

- `src/trips/readiness/engine/rule-engine.ts` - 规则引擎
- `src/trips/readiness/engine/readiness-checker.ts` - 准备度检查器
- `src/trips/readiness/types/readiness-pack.types.ts` - 类型定义
