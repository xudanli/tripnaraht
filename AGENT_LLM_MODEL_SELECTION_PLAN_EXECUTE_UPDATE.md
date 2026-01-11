# Plan-and-Execute Agent 模型选择支持

## 问题

之前 `PlannerService` 和 `ReplannerService` 硬编码使用 `LlmProvider.OPENAI`，不支持用户选择的模型。

## 原因

1. **调用链问题**：`DAGOrchestratorService.run()` 只接收 `threadId` 和 `userGoal`，无法获取 `AgentState` 中的 `llm_provider`
2. **方法签名缺失**：`PlannerService.generateDAGPlan()` 和 `ReplannerService.replan()` 的方法签名没有接收 provider 参数

## 解决方案

### 1. 修改 DAGOrchestratorService

- **注入依赖**：注入 `AgentStateService` 和 `LlmService`（可选）
- **获取 Provider**：添加 `getLlmProvider(threadId)` 方法，从 `AgentState` 中获取 `llm_provider`
- **传递 Provider**：在调用 `planner.generateDAGPlan()` 和 `replanner.replan()` 时传递 provider

```typescript
// src/agent/plan-execute/orchestrator.service.ts

constructor(
  private readonly planner: PlannerService,
  private readonly replanner: ReplannerService,
  private readonly executor: ExecutorService,
  private readonly contextAssembler: ContextAssemblerService,
  @Optional() private readonly agentStateService?: AgentStateService,
  @Optional() private readonly llmService?: LlmService,
) {}

private getLlmProvider(threadId: string): LlmProvider {
  if (this.agentStateService) {
    const state = this.agentStateService.get(threadId);
    if (state?.llm_provider && state.llm_provider !== 'auto') {
      switch (state.llm_provider) {
        case 'openai': return LlmProvider.OPENAI;
        case 'deepseek': return LlmProvider.DEEPSEEK;
        case 'gemini': return LlmProvider.GEMINI;
        case 'anthropic': return LlmProvider.ANTHROPIC;
      }
    }
  }
  
  // 使用系统推荐的默认 provider（'auto' 或未指定时）
  if (this.llmService) {
    return this.llmService.getDefaultProvider();
  }
  
  return LlmProvider.OPENAI; // 降级
}

// 调用时传递 provider
const llmProvider = this.getLlmProvider(threadId);
let tasks = await this.planner.generateDAGPlan(userGoal, contextSummary, llmProvider);
const replanResult = await this.replanner.replan(userGoal, tasks, memory, llmProvider);
```

### 2. 修改 PlannerService

- **方法签名**：`generateDAGPlan()` 添加可选的 `provider` 参数
- **使用 Provider**：使用传入的 provider 或默认使用 `LlmProvider.OPENAI`

```typescript
// src/agent/plan-execute/planner.service.ts

async generateDAGPlan(
  userGoal: string,
  context: string,
  provider?: LlmProvider,
): Promise<PlanTask[]> {
  // ...
  const llmProvider = provider || LlmProvider.OPENAI;
  const response = await this.llmService.callLlmWithSchema(
    llmProvider,
    fullPrompt,
    schema,
  );
  // ...
}
```

### 3. 修改 ReplannerService

- **方法签名**：`replan()` 添加可选的 `provider` 参数
- **使用 Provider**：使用传入的 provider 或默认使用 `LlmProvider.OPENAI`

```typescript
// src/agent/plan-execute/replanner.service.ts

async replan(
  userGoal: string,
  currentPlan: PlanTask[],
  memory: Record<string, any>,
  provider?: LlmProvider,
): Promise<ReplanResult> {
  // ...
  const llmProvider = provider || LlmProvider.OPENAI;
  const response = await this.llmService.callLlmWithSchema(
    llmProvider,
    fullPrompt,
    schema,
  );
  // ...
}
```

**注意**：`ReplannerService.createInitialPlan()` 方法也硬编码使用 `LlmProvider.OPENAI`，但该方法在当前代码中似乎未被调用。如果需要支持，可以按照相同的方式修改。

## 修改的文件

1. **src/agent/plan-execute/orchestrator.service.ts**
   - 添加 `AgentStateService` 和 `LlmService` 依赖注入
   - 添加 `getLlmProvider()` 方法
   - 在调用 `planner.generateDAGPlan()` 和 `replanner.replan()` 时传递 provider

2. **src/agent/plan-execute/planner.service.ts**
   - `generateDAGPlan()` 方法添加可选的 `provider` 参数
   - 使用传入的 provider 调用 LLM

3. **src/agent/plan-execute/replanner.service.ts**
   - `replan()` 方法添加可选的 `provider` 参数
   - 使用传入的 provider 调用 LLM

## 依赖注入

`PlanExecuteModule` 需要确保 `AgentStateService` 和 `LlmService` 可用。由于它们都是可选依赖（使用 `@Optional()`），如果不可用，系统会降级使用默认行为（`LlmProvider.OPENAI`）。

## 向后兼容性

- 所有修改都是向后兼容的（添加可选参数）
- 如果 provider 未提供，使用默认行为（`LlmProvider.OPENAI` 或系统推荐的默认 provider）
- 如果 `AgentStateService` 或 `LlmService` 不可用，降级使用 `LlmProvider.OPENAI`

## 测试

可以使用以下方式测试：

```bash
# 使用系统推荐的模型（auto）
curl -X POST http://localhost:3000/api/agent/route_and_run \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "test-001",
    "user_id": "user-123",
    "message": "规划5天东京游",
    "options": {
      "llm_provider": "auto"
    }
  }'

# 指定使用 DeepSeek
curl -X POST http://localhost:3000/api/agent/route_and_run \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "test-002",
    "user_id": "user-123",
    "message": "规划5天东京游",
    "options": {
      "llm_provider": "deepseek"
    }
  }'
```

## 总结

现在 `PlannerService` 和 `ReplannerService` 都支持模型选择了！用户可以通过 `options.llm_provider` 参数选择使用哪个 LLM 模型，包括：
- `'auto'`：使用系统推荐的模型
- `'openai'`：使用 OpenAI
- `'deepseek'`：使用 DeepSeek
- `'gemini'`：使用 Gemini
- `'anthropic'`：使用 Anthropic

所有智能体组件（System 1、System 2 ReAct、System 2 Plan-and-Execute）现在都支持模型选择。
