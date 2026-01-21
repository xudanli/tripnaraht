# 状态机路由问题修复

## 问题分析

### 根本原因

从服务器日志分析发现，**路由策略将请求降级到了 `CLAUDE_DYNAMIC`，而不是使用 `CLAUDE_SM` 状态机**。

### 日志证据

```
[AgentService] 路由决策: mode=CLAUDE_DYNAMIC, reason=... → CLAUDE_DYNAMIC (simple task, explicit Claude enabled, no structured output required)
[AgentService] 匹配规则: flag_resolution: CLAUDE_SM, rule_explicit_claude_simple_dynamic
```

### 问题详情

1. **路由规则问题**：
   - `applyExplicitClaudeSimpleDynamicRule` 规则在以下条件下降级到 `CLAUDE_DYNAMIC`：
     - 显式启用了 Claude 编排（`use_claude_orchestration: true`）
     - 任务被识别为简单任务（`complexity=SIMPLE`）
     - 不需要结构化输出（`requiresStructuredOutput=false`）
   - **问题**：该规则没有检查 `use_state_machine_orchestration` 选项
   - **结果**：即使显式设置了 `use_state_machine_orchestration: true`，也会被降级

2. **信号提取问题**：
   - 测试请求被识别为：
     - `taskType=GENERIC_QA`（应该是 `TRIP_PLANNING`）
     - `complexity=SIMPLE`（应该是 `COMPLEX` 或 `MODERATE`）
     - `requiresStructuredOutput=false`（应该是 `true`）

## 修复方案

### 修复 1: 路由规则修复 ✅

**文件**：`src/agent/utils/orchestration-policy.util.ts`

**修改**：在 `applyExplicitClaudeSimpleDynamicRule` 函数中添加检查

```typescript
// 如果显式启用了状态机，不降级
if (explicitlyStateMachine) {
  return null;
}
```

**效果**：当 `use_state_machine_orchestration: true` 时，不会降级到 `CLAUDE_DYNAMIC`

### 修复 2: 信号提取优化（可选）

如果需要更准确地识别行程规划请求，可以优化信号提取逻辑：

1. **任务类型识别**：
   - 检测包含"规划"、"行程"、"旅行"等关键词
   - 检测包含日期、天数、目的地等信息

2. **复杂度识别**：
   - 行程规划请求应该被识别为 `COMPLEX` 或 `MODERATE`
   - 包含多个约束条件（日期、地点、偏好等）的请求应该提高复杂度

3. **结构化输出识别**：
   - 行程规划请求应该设置 `requiresStructuredOutput=true`

## 测试验证

### 修复前

```
路由决策: mode=CLAUDE_DYNAMIC
匹配规则: rule_explicit_claude_simple_dynamic
```

### 修复后（预期）

```
路由决策: mode=CLAUDE_SM
匹配规则: flag_resolution: CLAUDE_SM
```

## 下一步

1. ✅ **已完成**：修复路由规则，尊重 `use_state_machine_orchestration` 选项
2. ⏳ **可选**：优化信号提取逻辑，更准确地识别行程规划请求
3. ⏳ **测试**：重新运行测试，验证状态机流程是否正常执行

## 相关文件

- `src/agent/utils/orchestration-policy.util.ts` - 路由策略（已修复）
- `src/agent/utils/orchestration-signals.util.ts` - 信号提取（可选优化）
- `scripts/test-state-machine-flow.ts` - 测试脚本
