# 状态机路由问题修复 V2

## 🔍 问题分析

### 测试失败现象

所有测试用例都在约 20 秒超时，`decision_log` 为空，说明状态机根本没有执行。

最后一个测试显示 `BREAKER_OPEN:CLAUDE_DYNAMIC`，说明：
1. 路由策略将请求降级到了 `CLAUDE_DYNAMIC`，而不是 `CLAUDE_SM`
2. `CLAUDE_DYNAMIC` 的断路器可能已经打开

### 根本原因

**问题 1：`applySimpleDynamicRule` 规则未检查 `use_state_machine_orchestration`**

在 `orchestration-policy.util.ts` 中，`applySimpleDynamicRule` 函数会在以下条件下降级到 `CLAUDE_DYNAMIC`：
- `modeResult.mode === 'CLAUDE_SM'`
- `signals.complexity === 'SIMPLE'`
- `!signals.requiresStructuredOutput`

**问题**：该规则没有检查 `use_state_machine_orchestration` 选项，即使显式设置了 `use_state_machine_orchestration: true`，也会被降级。

**问题 2：测试超时时间过短**

测试中 `max_seconds: 20` 太短，状态机需要执行多个步骤（INTAKE → RESEARCH → GATE_EVAL → PLAN_GEN → VERIFY → NARRATE → DONE），每个步骤可能需要几秒钟，20秒不够。

## ✅ 修复方案

### 修复 1: 路由规则修复 ✅

**文件**：`src/agent/utils/orchestration-policy.util.ts`

**修改**：在 `applySimpleDynamicRule` 函数中添加 `use_state_machine_orchestration` 检查

```typescript
function applySimpleDynamicRule(
  modeResult: ResolveModeResult,
  options: OrchestrationOptions | undefined, // 🆕 添加 options 参数
  signals: RoutingSignals,
): { mode: OrchestrationMode; reason: string; rule: string } | null {
  const explicitlyStateMachine = options?.use_state_machine_orchestration === true;
  
  // 🆕 如果显式启用了状态机，不降级
  if (explicitlyStateMachine) {
    return null;
  }
  
  // ... 原有逻辑
}
```

**调用处修改**：
```typescript
// 修改前
const simpleDynamicResult = applySimpleDynamicRule(modeResult, signals);

// 修改后
const simpleDynamicResult = applySimpleDynamicRule(modeResult, options, signals);
```

**效果**：当 `use_state_machine_orchestration: true` 时，不会降级到 `CLAUDE_DYNAMIC`

### 修复 2: 增加测试超时时间 ✅

**文件**：`scripts/test-state-machine-flow.ts`

**修改**：将所有测试用例的 `max_seconds` 从 `20` 增加到 `60`

```typescript
max_seconds: 60, // 服务器端最大超时时间（状态机需要更多时间）
```

**效果**：给状态机足够的时间执行所有步骤

## 📋 修复后的路由规则优先级

1. **ModeLock 优先级**：如果存在锁定模式，优先使用
2. **Circuit Breaker 检查**：如果模式熔断，自动降级
3. **规则 1**：简单请求降级到 LEGACY（如果未显式启用 Claude）
4. **规则 2**：显式启用时的简单任务优化（如果未显式启用状态机）
5. **规则 3**：复杂结构化任务使用状态机
6. **规则 4**：简单任务使用动态编排（**已修复**：如果显式启用状态机，不降级）

## 🧪 测试建议

1. **重置断路器**：如果之前的测试导致断路器打开，需要等待 30 秒（断路器自动恢复时间）或重启服务器
2. **运行测试**：`npm run test:state-machine`
3. **检查日志**：确认路由决策为 `CLAUDE_SM` 而不是 `CLAUDE_DYNAMIC`

## 📝 相关文件

- `src/agent/utils/orchestration-policy.util.ts` - 路由策略
- `scripts/test-state-machine-flow.ts` - 测试脚本
- `src/agent/services/orchestration-stability.util.ts` - 断路器实现

## ✅ 修复状态

- [x] 修复 `applySimpleDynamicRule` 函数
- [x] 增加测试超时时间
- [x] 更新函数调用
- [x] 验证无 lint 错误

## 🎯 下一步

1. 运行测试验证修复效果
2. 如果仍有问题，检查信号提取逻辑（`signalsFromRequest`）
3. 检查断路器状态，必要时重置
