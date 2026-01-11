# 智能体模型选择功能实现

## 需求

1. **'auto'** 指的是系统推荐的模型（使用系统根据环境变量推荐的默认模型）
2. 用户需要能够从 **OPENAI, GEMINI, DEEPSEEK, ANTHROPIC** 这些模型中选择切换
3. 这些模型应该可以在接口层面选择

## 已完成的实现

### 1. 接口层面支持模型选择

在 `AgentOptionsDto` 中添加了 `llm_provider` 字段：

```typescript
@ApiPropertyOptional({ 
  description: 'LLM 提供商（auto/openai/deepseek/gemini/anthropic），auto 表示使用系统推荐的模型',
  example: 'auto',
  enum: ['auto', 'openai', 'deepseek', 'gemini', 'anthropic'],
  default: 'auto',
})
@IsOptional()
@IsEnum(['auto', 'openai', 'deepseek', 'gemini', 'anthropic'])
llm_provider?: 'auto' | 'openai' | 'deepseek' | 'gemini' | 'anthropic';
```

### 2. LlmService 支持获取系统推荐的模型

在 `LlmService` 中添加了 `getDefaultProvider()` 方法：

```typescript
/**
 * 获取系统推荐的默认提供商
 * 
 * @returns 系统推荐的 LLM 提供商
 */
getDefaultProvider(): LlmProvider {
  return this.defaultProvider;
}
```

系统推荐的逻辑（优先级）：
1. DeepSeek（如果配置了 `DEEPSEEK_API_KEY`）
2. OpenAI（如果配置了 `OPENAI_API_KEY`）
3. Gemini（如果配置了 `GEMINI_API_KEY`）
4. Anthropic（如果配置了 `ANTHROPIC_API_KEY`）

### 3. AgentState 支持存储 llm_provider

在 `AgentState` 接口中添加了 `llm_provider` 字段：

```typescript
/** LLM 提供商（可选，用于覆盖系统默认设置） */
llm_provider?: 'auto' | 'openai' | 'deepseek' | 'gemini' | 'anthropic';
```

在 `AgentStateService.createInitialState()` 中从 `options` 中提取并设置：

```typescript
llm_provider: options?.llm_provider || 'auto',
```

### 4. LlmPlanService 支持使用指定的 provider

修改了 `LlmPlanService.selectAction()` 方法：
- 使用公开的 `llmService.callLlmWithSchema()` 方法（而不是反射访问私有方法）
- 从 `state.llm_provider` 中获取 provider
- 如果为 'auto'，使用系统推荐的默认 provider
- 如果指定了具体的 provider，使用指定的 provider

```typescript
// 获取 provider（从 state 中获取，如果没有或为 'auto' 则使用系统默认）
const provider = this.getProviderFromState(state);

// 调用 LLM（使用指定的或默认的 provider）
const response = await this.llmService.callLlmWithSchema(provider, prompt, schema);
```

## 使用方式

### 1. 使用系统推荐的模型（'auto'）

```json
{
  "request_id": "req-001",
  "user_id": "user-123",
  "message": "规划5天东京游",
  "options": {
    "llm_provider": "auto"
  }
}
```

或者不指定 `llm_provider`（默认就是 'auto'）：

```json
{
  "request_id": "req-001",
  "user_id": "user-123",
  "message": "规划5天东京游"
}
```

### 2. 指定使用 OpenAI

```json
{
  "request_id": "req-001",
  "user_id": "user-123",
  "message": "规划5天东京游",
  "options": {
    "llm_provider": "openai"
  }
}
```

### 3. 指定使用 DeepSeek

```json
{
  "request_id": "req-001",
  "user_id": "user-123",
  "message": "规划5天东京游",
  "options": {
    "llm_provider": "deepseek"
  }
}
```

### 4. 指定使用 Gemini

```json
{
  "request_id": "req-001",
  "user_id": "user-123",
  "message": "规划5天东京游",
  "options": {
    "llm_provider": "gemini"
  }
}
```

### 5. 指定使用 Anthropic

```json
{
  "request_id": "req-001",
  "user_id": "user-123",
  "message": "规划5天东京游",
  "options": {
    "llm_provider": "anthropic"
  }
}
```

## 注意事项

### 1. 无法访问外网时的配置

如果环境无法访问外网，系统会：
1. 如果启用了 `LLM_USE_MOCK=true`，使用 Mock 模式（不调用任何 LLM API）
2. 如果网络请求失败，自动回退到 Mock 模式
3. 如果 LLM 调用失败，回退到规则引擎

**建议配置**：
```bash
# .env 文件
LLM_USE_MOCK=true  # 强制使用 Mock 模式（不尝试调用 LLM API）
```

或者不配置任何 API Key，系统会自动使用 Mock 模式。

### 2. System 2 Plan-and-Execute Agent

**已更新**：现在 `PlannerService` 和 `ReplannerService` 也支持模型选择了！

实现方式：
1. `DAGOrchestratorService` 通过 `AgentStateService` 获取 `AgentState` 中的 `llm_provider`
2. 将 provider 传递给 `PlannerService.generateDAGPlan()` 和 `ReplannerService.replan()`
3. 这两个服务使用传入的 provider（如果提供）或系统默认的 provider

**当前状态**：
- ✅ `LlmPlanService` 支持模型选择（ReAct 循环）
- ✅ `PlannerService` 支持模型选择（Plan-and-Execute Agent）
- ✅ `ReplannerService` 支持模型选择（Plan-and-Execute Agent）

## 代码位置

1. **接口定义**：`src/agent/dto/route-and-run.dto.ts`（第 88-96 行）
2. **AgentState 接口**：`src/agent/interfaces/agent-state.interface.ts`（第 110-112 行）
3. **状态初始化**：`src/agent/services/agent-state.service.ts`（第 82 行）
4. **LLM 服务**：`src/llm/services/llm.service.ts`（第 94-100 行）
5. **LLM Plan 服务**：`src/agent/services/llm-plan-service.ts`（第 88 行，第 276-291 行）

## 测试

可以使用以下命令测试：

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

# 指定使用 OpenAI
curl -X POST http://localhost:3000/api/agent/route_and_run \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "test-002",
    "user_id": "user-123",
    "message": "规划5天东京游",
    "options": {
      "llm_provider": "openai"
    }
  }'

# 指定使用 DeepSeek
curl -X POST http://localhost:3000/api/agent/route_and_run \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "test-003",
    "user_id": "user-123",
    "message": "规划5天东京游",
    "options": {
      "llm_provider": "deepseek"
    }
  }'
```
