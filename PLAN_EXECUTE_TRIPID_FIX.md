# Plan-and-Execute tripId 传递修复

## 🐛 问题描述

在生产环境中，Plan-and-Execute Agent 执行时出现错误：

```
ERROR [ExecutorService] 步骤 T1 执行失败: tripId is required for trip.load_draft. 
Available sources:
- input.trip_id: undefined
- input.tripId: undefined
- state.trip.trip_id: undefined
- state.tripId: undefined
```

## 🔍 根本原因

`tripId` 没有从 `AgentService` 传递到 Plan-and-Execute 的执行上下文中：

1. **AgentService** 调用 `dagOrchestrator.run(threadId, userGoal)` 时，只传递了 `threadId` 和 `userGoal`，没有传递 `tripId`
2. **DAGOrchestratorService** 的 `run` 方法没有接收 `tripId` 参数
3. **ExecutorService** 执行 action 时，`context` 中没有 `tripId` 信息
4. **trip.load_draft** action 需要 `tripId`，但无法从任何地方获取

## ✅ 修复方案

### 1. 修改 AgentService

在调用 `dagOrchestrator.run` 时传递执行上下文：

```typescript
// 修复前
const dagResult = await this.dagOrchestrator.run(
  state.request_id,
  request.message,
);

// 修复后
const dagResult = await this.dagOrchestrator.run(
  state.request_id,
  request.message,
  {
    tripId: request.trip_id,
    userId: request.user_id,
    requestId: request.request_id,
  },
);
```

### 2. 修改 DAGOrchestratorService

- 添加 `executionContext` 参数到 `run` 方法
- 保存执行上下文到实例变量
- 在执行任务时传递上下文

```typescript
// 添加实例变量
private executionContext: {
  tripId?: string | null;
  userId?: string;
  requestId?: string;
} = {};

// 修改 run 方法签名
async run(
  threadId: string,
  userGoal: string,
  executionContext?: {
    tripId?: string | null;
    userId?: string;
    requestId?: string;
  },
): Promise<OrchestrationResult> {
  // 保存执行上下文
  this.executionContext = executionContext || {};
  // ...
}

// 在执行任务时传递上下文
return this.executor.executeStep(enrichedTask, memory, {
  context: enrichedContext,
  globalContext: globalContext,
  tripId: this.executionContext.tripId,
  userId: this.executionContext.userId,
  requestId: this.executionContext.requestId,
  trip: this.executionContext.tripId ? { trip_id: this.executionContext.tripId } : undefined,
});
```

### 3. 修改 ExecutorService

在 `extractInput` 方法中从 context 提取 `tripId`：

```typescript
private extractInput(
  description: string,
  memory: Record<string, any>,
  context: any,
): any {
  // 从 context 中提取 tripId（如果存在）
  const tripId = context?.tripId || context?.trip?.trip_id || context?.trip_id;
  
  const input: any = {
    description,
    context: {
      memory,
      ...context,
    },
  };
  
  // 如果找到了 tripId，添加到 input 中（优先使用）
  if (tripId) {
    input.trip_id = tripId;
    input.tripId = tripId; // 同时支持两种命名
  }
  
  return input;
}
```

## 📋 修改文件

1. ✅ `src/agent/services/agent.service.ts` - 传递执行上下文
2. ✅ `src/agent/plan-execute/orchestrator.service.ts` - 接收并传递执行上下文
3. ✅ `src/agent/plan-execute/executor.service.ts` - 从 context 提取 tripId

## 🧪 验证

修复后，`trip.load_draft` action 应该能够从以下来源获取 `tripId`：

1. `input.trip_id` - 从 `extractInput` 直接设置
2. `input.tripId` - 从 `extractInput` 直接设置（兼容性）
3. `state.trip.trip_id` - 从 context.trip 中获取
4. `state.tripId` - 从 context.tripId 中获取

## ⚠️ 注意事项

1. **向后兼容**：如果请求中没有 `trip_id`，系统会继续工作（某些 action 可能失败，但不会崩溃）
2. **命名兼容**：同时支持 `trip_id` 和 `tripId` 两种命名方式
3. **优先级**：`input.trip_id` > `input.tripId` > `state.trip.trip_id` > `state.tripId`

## 🚀 部署

修复后需要：
1. 重新构建应用
2. 重启服务
3. 测试包含 `trip_id` 的请求

---

**最后更新**: 2024-01-12  
**状态**: ✅ 已修复
