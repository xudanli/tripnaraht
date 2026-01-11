# Replanner Provider 传递修复

## 问题

从日志中发现，Replanner 使用了 OpenAI API，而不是用户选择的模型（DeepSeek）。

**日志显示**：
- Planner 使用 DeepSeek API（正确）✓
- Replanner 使用 OpenAI API（错误）✗

## 原因

`DAGOrchestratorService` 中有 3 处调用 `replanner.replan()`：
1. ✅ 第84行：传递了 `llmProvider`（正确）
2. ❌ 第113行：**没有**传递 `llmProvider`（错误）
3. ❌ 第201行：**没有**传递 `llmProvider`（错误）

日志显示的是第200行的调用（"🔄 Triggering replanner"），所以是第201行的调用没有传递 provider。

## 修复

修复了所有调用 `replanner.replan()` 的地方，确保都传递了 `llmProvider`：

### 1. 死锁检测时的调用（第113行）

```typescript
// 修复前
const replanResult = await this.replanner.replan(userGoal, tasks, memory);

// 修复后
const replanResult = await this.replanner.replan(userGoal, tasks, memory, llmProvider);
```

### 2. 批次执行失败时的调用（第201行）

```typescript
// 修复前
const replanResult = await this.replanner.replan(userGoal, tasks, memory);

// 修复后
const replanResult = await this.replanner.replan(userGoal, tasks, memory, llmProvider);
```

### 3. 任务失败时的调用（第84行）

✅ 这个调用已经正确传递了 `llmProvider`，无需修改。

## 验证

现在所有 `replanner.replan()` 调用都传递了 `llmProvider`，Replanner 将使用用户选择的模型（如果用户选择了 'deepseek'，Replanner 也会使用 DeepSeek，而不是硬编码的 OpenAI）。

## 修改的文件

- `src/agent/plan-execute/orchestrator.service.ts`
