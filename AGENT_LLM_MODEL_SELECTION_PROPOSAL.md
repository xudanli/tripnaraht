# 智能体模型选择功能提案

## 需求

1. 智能体接口支持模型选择
2. 'auto' 是系统定义的（用于无法访问外网的环境）
3. 当前环境无法访问外网，需要支持本地/禁用模式

## 当前状态

### 已有的能力

1. **LlmService 支持多种提供商**：
   - OPENAI
   - GEMINI
   - DEEPSEEK
   - ANTHROPIC

2. **环境变量配置**：
   - `OPENAI_API_KEY` / `OPENAI_MODEL`
   - `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL`
   - `GEMINI_API_KEY` / `GEMINI_MODEL`
   - `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`
   - `LLM_USE_MOCK` (启用 Mock 模式)

3. **自动回退机制**：
   - 网络错误时自动回退到 Mock 模式
   - LLM 失败时回退到规则引擎

### 缺少的功能

1. **接口层面不支持模型选择**：
   - `AgentOptionsDto` 中没有 `llm_provider` 或 `llm_model` 字段
   - 无法在请求时指定使用哪个模型

2. **'auto' 模式未明确支持**：
   - 当前是隐式的（根据环境变量自动选择）
   - 没有明确的 'auto' / 'mock' / 'disabled' 选项

## 实现方案

### 方案 1: 添加 llm_provider 字段到 AgentOptionsDto

```typescript
export class AgentOptionsDto {
  // ... 现有字段 ...
  
  @ApiPropertyOptional({ 
    description: 'LLM 提供商（auto/openai/deepseek/gemini/anthropic/mock），auto 表示系统自动选择',
    example: 'auto',
    enum: ['auto', 'openai', 'deepseek', 'gemini', 'anthropic', 'mock'],
    default: 'auto',
  })
  @IsOptional()
  @IsEnum(['auto', 'openai', 'deepseek', 'gemini', 'anthropic', 'mock'])
  llm_provider?: 'auto' | 'openai' | 'deepseek' | 'gemini' | 'anthropic' | 'mock';
}
```

### 方案 2: 传递到 LLM 服务

需要在以下地方传递 `llm_provider`：
1. `LlmPlanService.selectAction()` - 调用 LLM 选择 Action
2. `PlannerService` (Plan-and-Execute) - 生成 DAG 计划
3. `ReactSystemPromptService` - System 2 ReAct 循环

### 方案 3: 'auto' 模式逻辑

- `'auto'`: 系统根据环境变量自动选择（当前逻辑）
  - 优先级：DeepSeek > OpenAI > Gemini > Anthropic
  - 如果网络不可用，自动回退到 Mock
- `'mock'`: 强制使用 Mock 模式（不调用任何 LLM API）
- `'openai'` / `'deepseek'` 等: 强制使用指定提供商

### 方案 4: 无法访问外网时的配置

**选项 A: 使用 Mock 模式**
```bash
LLM_USE_MOCK=true
```

**选项 B: 不配置任何 API Key**
- 系统会自动使用 Mock 模式
- 或回退到规则引擎

**选项 C: 接口传入 `llm_provider: 'mock'`**
- 强制使用 Mock 模式
- 不尝试调用任何 LLM API

## 推荐方案

建议采用**方案 1 + 方案 3**：
1. 添加 `llm_provider` 字段到 `AgentOptionsDto`
2. 支持 `'auto'`、`'mock'` 和具体的提供商名称
3. 在无法访问外网时，前端可以传入 `llm_provider: 'mock'`

## 注意事项

1. **向后兼容**：
   - `llm_provider` 字段是可选的
   - 默认为 `'auto'`，保持当前行为

2. **传递链路**：
   - `AgentOptionsDto` -> `AgentState` -> `LlmService`
   - 需要在多个服务中传递此参数

3. **Mock 模式**：
   - 确保 Mock 模式的行为合理
   - 不要返回错误的 mock 数据
