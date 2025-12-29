# Agent 和 LLM 集成状态

## 📊 当前状态总结

### ❌ LangGraph 编排层：**未集成 LLM**（占位实现）

**Phase 2 的 Agent**：
1. **Planner Agent** (`src/trips/decision/orchestration/planner-agent.service.ts`)
   - ✅ 已创建
   - ❌ **未集成 LLM**（使用规则匹配占位）
   - 功能：意图识别、参数提取（国家、月份、用户能力等）
   - TODO：注入 LLM 服务（OpenAI / Anthropic）

2. **Narrator Agent** (`src/trips/decision/orchestration/narrator-agent.service.ts`)
   - ✅ 已创建
   - ❌ **未集成 LLM**（使用模板占位）
   - 功能：结果润色、解释生成
   - TODO：注入 LLM 服务（OpenAI / Anthropic）

### ✅ 系统中已有的 LLM 服务

**通用 LLM 服务**：
- `src/llm/services/llm.service.ts`
  - 支持 OpenAI、Gemini、DeepSeek、Anthropic
  - 提供自然语言转参数、决策支持、结果人性化等功能
  - 已集成熔断器和重试机制

**Agent 模块的 LLM 服务**：
- `src/agent/services/llm-plan-service.ts`
  - 用于 Agent 的规划服务
  - 支持 Action 选择、规划生成

**语音解析的 LLM 服务**：
- `src/voice/services/llm-voice-parser.service.ts`
  - 用于语音转文字的智能解析

## 🤖 系统中的 Agent 列表

### Phase 2: LangGraph 编排层（2 个 Agent）

1. **Planner Agent** - 意图识别、参数提取
   - 文件：`src/trips/decision/orchestration/planner-agent.service.ts`
   - 状态：✅ 已创建，❌ 未集成 LLM
   - 职责：分析用户查询，提取参数（国家、月份、用户能力等）

2. **Narrator Agent** - 结果润色、解释生成
   - 文件：`src/trips/decision/orchestration/narrator-agent.service.ts`
   - 状态：✅ 已创建，❌ 未集成 LLM
   - 职责：生成可读的解释和故事层文案

### 原有系统：Agent 模块（多个服务）

**核心 Agent 服务**：
1. **AgentService** - 主 Agent 服务
   - 文件：`src/agent/services/agent.service.ts`
   - 职责：统一入口，处理自然语言请求

2. **RouterService** - 路由服务
   - 文件：`src/agent/services/router.service.ts`
   - 职责：根据用户输入路由到不同的执行路径（System 1 / System 2）

3. **OrchestratorService** - 编排服务
   - 文件：`src/agent/services/orchestrator.service.ts`
   - 职责：System 2 的 ReAct 循环编排（Plan → Act → Observe → Critic → Repair）

4. **System1ExecutorService** - System 1 执行器
   - 文件：`src/agent/services/system1-executor.service.ts`
   - 职责：快速路径执行（< 3秒）

5. **CriticService** - 批评者服务
   - 文件：`src/agent/services/critic.service.ts`
   - 职责：可行性检查（时间窗、日界、午餐、鲁棒时间）

6. **LlmPlanService** - LLM 规划服务
   - 文件：`src/agent/services/llm-plan-service.ts`
   - 职责：使用 LLM 进行 Action 选择和规划生成
   - ✅ **已集成 LLM**

### 决策层的"三人格"（不是 Agent，是策略）

1. **Abu Strategy** - 安全否决者
   - 文件：`src/trips/decision/strategies/abu-strategy.service.ts`
   - 职责：硬约束检查，安全把关

2. **Dr.Dre Strategy** - 节奏修复者
   - 文件：`src/trips/decision/strategies/dr-dre-strategy.service.ts`
   - 职责：结构修复，节奏管理

3. **Neptune Strategy** - 空间修复者
   - 文件：`src/trips/decision/strategies/neptune-strategy.service.ts`
   - 职责：空间替换，路线修复

## 📈 Agent 统计

| 类型 | 数量 | 状态 | 说明 |
|------|------|------|------|
| LangGraph Agent | 2 | ⚠️ 占位实现 | Planner、Narrator（未集成 LLM） |
| Agent 模块服务 | 6+ | ✅ 已实现 | AgentService、RouterService 等 |
| LLM 服务 | 3 | ✅ 已实现 | LlmService、LlmPlanService、LlmVoiceParserService |
| 决策策略 | 3 | ✅ 已实现 | Abu、Dr.Dre、Neptune（不是 Agent） |

## 🔧 如何集成 LLM 到 LangGraph Agent

### 方案 1：使用现有的 LlmService

```typescript
// planner-agent.service.ts
import { LlmService } from '../../llm/services/llm.service';

constructor(
  private readonly llmService: LlmService,
) {}

async analyzeQuery(query: string): Promise<...> {
  // 使用 LLM 进行意图识别和参数提取
  const prompt = `分析以下用户查询，提取关键信息：
${query}

请返回 JSON 格式：
{
  "intent": "PLAN_TRIP" | "RECOMMEND_ROUTE",
  "countryCode": "IS" | "NP" | "CH",
  "month": 1-12,
  "humanCapability": {
    "preferredPace": "SLOW" | "MEDIUM" | "FAST",
    "riskTolerance": "LOW" | "MEDIUM" | "HIGH",
    "specialConstraints": ["膝盖不好", "恐高"]
  }
}`;

  const response = await this.llmService.naturalLanguageToParams({
    query: prompt,
    provider: 'openai', // 或从配置读取
  });

  // 解析 LLM 响应并返回
  return this.parseLlmResponse(response);
}
```

### 方案 2：使用 LangChain 直接集成

```typescript
// planner-agent.service.ts
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';

constructor() {
  this.llm = new ChatOpenAI({
    modelName: 'gpt-4',
    temperature: 0,
  });
}

async analyzeQuery(query: string): Promise<...> {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', '你是一个旅行规划助手，负责分析用户查询并提取关键信息。'],
    ['human', '{query}'],
  ]);

  const chain = prompt.pipe(this.llm);
  const response = await chain.invoke({ query });

  // 解析响应
  return this.parseResponse(response);
}
```

## 📝 下一步建议

### Priority 1: 集成 LLM 到 Planner Agent
- ✅ 使用现有的 `LlmService`
- ✅ 添加结构化输出（JSON Schema）
- ✅ 添加错误处理和回退机制

### Priority 2: 集成 LLM 到 Narrator Agent
- ✅ 使用 LLM 生成更自然的解释
- ✅ 保持决策日志的准确性
- ✅ 添加个性化风格

### Priority 3: 完善 LangGraph StateGraph
- ✅ 使用完整的 LangGraph StateGraph API
- ✅ 支持分支控制、失败重试
- ✅ 添加可视化

## 🎯 总结

**当前状态**：
- ✅ LangGraph 编排层架构已完成
- ❌ Planner Agent 和 Narrator Agent **未集成 LLM**（使用占位实现）
- ✅ 系统中已有可用的 LLM 服务
- ✅ 原有 Agent 模块已集成 LLM

**系统总共有**：
- **2 个 LangGraph Agent**（未集成 LLM）
- **6+ 个 Agent 模块服务**（部分已集成 LLM）
- **3 个 LLM 服务**（已实现）
- **3 个决策策略**（不是 Agent，是确定性逻辑）

**建议**：下一步优先集成 LLM 到 Planner Agent 和 Narrator Agent，使用现有的 `LlmService` 即可。

