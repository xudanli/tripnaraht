# Claude 智能体编排方案提案

## 📋 概述

**问题**：当前智能体入口使用规则驱动的路由（`RouterService`），缺乏灵活性和上下文理解能力。

**提案**：使用 **Claude 3.5 Sonnet** 作为智能体编排引擎，统一管理路由决策、Skills 选择和执行编排。

---

## 🔍 当前架构分析

### 当前架构流程

```
用户请求
  ↓
RouterService (规则驱动)
  ├─ 硬规则短路检查
  ├─ 特征提取
  ├─ 灰区打分
  └─ 路由决策
      ↓
AgentService
  ├─ System 1 (快速路径)
  │   ├─ SYSTEM1_API
  │   └─ SYSTEM1_RAG
  └─ System 2 (慢速路径)
      ├─ OrchestratorService (ReAct 循环)
      └─ DAGOrchestratorService (Plan-and-Execute)
```

### 当前架构的局限性

1. **规则驱动，缺乏灵活性**
   - 硬规则短路：只能处理明确的场景
   - 特征打分：基于关键词和模式匹配，无法理解语义
   - 难以处理复杂、模糊的用户意图

2. **Skills 选择静态**
   - 路由决策后，Skills 选择是固定的
   - 无法根据上下文动态选择 Skills
   - 无法整合新的分析类 Skills（PEST、行业分析等）

3. **上下文理解有限**
   - 无法理解对话历史中的隐含信息
   - 无法识别用户意图的细微差别
   - 无法处理多轮对话的上下文依赖

4. **编排逻辑分散**
   - 路由逻辑在 `RouterService`
   - 执行逻辑在 `OrchestratorService`
   - Skills 调用分散在各个服务中
   - 难以统一管理和优化

---

## ✨ Claude 编排方案

### 核心思想

**用 Claude 作为"智能调度员"**，统一管理：
- 路由决策（理解用户意图，选择 System 1/2）
- Skills 选择（动态选择需要的 Skills）
- 执行编排（决定 Skills 的执行顺序和依赖关系）

### 新架构流程

```
用户请求
  ↓
Claude Orchestrator (智能编排)
  ├─ 理解用户意图
  ├─ 分析上下文
  ├─ 选择路由策略 (System 1/2)
  ├─ 动态选择 Skills
  └─ 编排执行计划
      ↓
Skills Execution Engine
  ├─ 现有 Skills (decision, geo, readiness, etc.)
  ├─ 分析类 Skills (PEST, industry, competitive)
  └─ 工具调用 (MCP, Actions)
      ↓
结果整合与响应
```

---

## 🎯 优势分析

### 1. 更智能的路由决策

**当前方式**：
```typescript
// 规则驱动
if (userInput.includes('支付') || userInput.includes('退款')) {
  return RouteType.SYSTEM2_REASONING;
}
```

**Claude 编排**：
```typescript
// 语义理解
Claude 分析：
- 用户意图："我想取消昨天的预订"
- 上下文：用户有未完成的行程
- 决策：需要 System 2，调用 cancellation Skills
- 理由：涉及复杂的状态检查和退款逻辑
```

### 2. 动态 Skills 选择

**当前方式**：
- 路由后，Skills 选择是固定的
- 无法根据具体情况动态调整

**Claude 编排**：
```typescript
Claude 分析用户请求："分析 TripNARA 的市场机会"

选择的 Skills：
1. skill.analysis.industryOverview (市场概览)
2. skill.analysis.competitiveLandscape (竞争分析)
3. skill.analysis.pestAnalysis (PEST 分析)

执行顺序：
1. 先做市场概览（提供背景）
2. 再做竞争分析（了解竞争环境）
3. 最后做 PEST 分析（综合评估）
```

### 3. 更好的上下文理解

**当前方式**：
- 只能基于当前请求做决策
- 无法理解对话历史中的隐含信息

**Claude 编排**：
```typescript
对话历史：
- 用户："我想去冰岛"
- 助手："好的，我为您规划..."
- 用户："但是预算有限"

Claude 理解：
- 用户意图：在已有规划基础上调整预算
- 上下文：已有初步行程规划
- 决策：调用 budget optimization Skills
- 而不是重新规划整个行程
```

### 4. 统一编排管理

**当前方式**：
- 路由、执行、Skills 调用分散在不同服务
- 难以统一管理和优化

**Claude 编排**：
- 所有决策和编排逻辑集中在 Claude Orchestrator
- 统一的 Skills 注册和调用接口
- 统一的错误处理和降级策略

---

## 🏗️ 架构设计

### 1. Claude Orchestrator Service

```typescript
// src/agent/services/claude-orchestrator.service.ts

@Injectable()
export class ClaudeOrchestratorService {
  constructor(
    private llmService: LlmService, // Claude API
    private skillsRegistry: SkillsRegistryService,
    private actionRegistry: ActionRegistryService,
  ) {}

  /**
   * 智能编排主入口
   */
  async orchestrate(
    request: RouteAndRunRequestDto,
    context: AgentContext
  ): Promise<OrchestrationResult> {
    // 1. 使用 Claude 分析用户意图
    const intentAnalysis = await this.analyzeIntent(request, context);
    
    // 2. 使用 Claude 选择路由策略
    const routingDecision = await this.decideRouting(intentAnalysis);
    
    // 3. 使用 Claude 选择 Skills
    const skillsPlan = await this.selectSkills(intentAnalysis, routingDecision);
    
    // 4. 使用 Claude 编排执行计划
    const executionPlan = await this.planExecution(skillsPlan);
    
    // 5. 执行计划
    const result = await this.executePlan(executionPlan, context);
    
    return result;
  }

  /**
   * 分析用户意图（使用 Claude）
   */
  private async analyzeIntent(
    request: RouteAndRunRequestDto,
    context: AgentContext
  ): Promise<IntentAnalysis> {
    const prompt = this.buildIntentAnalysisPrompt(request, context);
    
    const response = await this.llmService.callClaude({
      systemPrompt: INTENT_ANALYSIS_PROMPT,
      userMessage: prompt,
      tools: [], // 不需要工具，只是分析意图
    });
    
    return this.parseIntentAnalysis(response);
  }

  /**
   * 路由决策（使用 Claude）
   */
  private async decideRouting(
    intentAnalysis: IntentAnalysis
  ): Promise<RoutingDecision> {
    const prompt = this.buildRoutingPrompt(intentAnalysis);
    
    const response = await this.llmService.callClaude({
      systemPrompt: ROUTING_DECISION_PROMPT,
      userMessage: prompt,
      tools: [], // 不需要工具，只是做决策
    });
    
    return this.parseRoutingDecision(response);
  }

  /**
   * 选择 Skills（使用 Claude）
   */
  private async selectSkills(
    intentAnalysis: IntentAnalysis,
    routingDecision: RoutingDecision
  ): Promise<SkillsPlan> {
    // 获取所有可用的 Skills
    const availableSkills = this.skillsRegistry.getAllSkills();
    
    const prompt = this.buildSkillsSelectionPrompt(
      intentAnalysis,
      routingDecision,
      availableSkills
    );
    
    const response = await this.llmService.callClaude({
      systemPrompt: SKILLS_SELECTION_PROMPT,
      userMessage: prompt,
      tools: availableSkills.map(skill => ({
        name: skill.name,
        description: skill.description,
        inputSchema: skill.inputSchema,
      })),
    });
    
    return this.parseSkillsPlan(response);
  }

  /**
   * 编排执行计划（使用 Claude）
   */
  private async planExecution(
    skillsPlan: SkillsPlan
  ): Promise<ExecutionPlan> {
    const prompt = this.buildExecutionPlanningPrompt(skillsPlan);
    
    const response = await this.llmService.callClaude({
      systemPrompt: EXECUTION_PLANNING_PROMPT,
      userMessage: prompt,
      tools: [],
    });
    
    return this.parseExecutionPlan(response);
  }

  /**
   * 执行计划
   */
  private async executePlan(
    plan: ExecutionPlan,
    context: AgentContext
  ): Promise<OrchestrationResult> {
    const results: Record<string, any> = {};
    
    // 按计划顺序执行 Skills
    for (const step of plan.steps) {
      if (step.type === 'skill') {
        const skill = this.skillsRegistry.getSkill(step.skillName);
        if (!skill) {
          throw new Error(`Skill not found: ${step.skillName}`);
        }
        
        // 准备输入（可以使用前面步骤的结果）
        const input = this.prepareSkillInput(step, results, context);
        
        // 执行 Skill
        const result = await skill.execute(input);
        results[step.id] = result;
      } else if (step.type === 'action') {
        // 执行 Action
        const action = this.actionRegistry.getAction(step.actionName);
        if (!action) {
          throw new Error(`Action not found: ${step.actionName}`);
        }
        
        const input = this.prepareActionInput(step, results, context);
        const result = await action.execute(input);
        results[step.id] = result;
      }
    }
    
    // 整合结果
    return this.aggregateResults(results, plan);
  }
}
```

### 2. 系统提示词设计

#### Intent Analysis Prompt

```typescript
export const INTENT_ANALYSIS_PROMPT = `
[角色定位]

你是 TripNARA 智能体的意图分析专家。你的任务是理解用户的真实意图，分析请求的复杂度和所需能力。

[分析维度]

1. **用户意图类型**：
   - 简单查询（CRUD、事实查询）
   - 复杂规划（行程规划、多约束优化）
   - 分析请求（行业分析、竞品分析、PEST 分析）
   - 决策请求（路线选择、风险评估）

2. **复杂度评估**：
   - 简单：单一操作，无需推理
   - 中等：需要多步操作，但逻辑清晰
   - 复杂：需要推理、优化、多轮交互

3. **所需能力**：
   - 数据查询能力
   - 规划能力
   - 分析能力
   - 决策能力

[输出格式]

{
  "intentType": "simple_query" | "complex_planning" | "analysis" | "decision",
  "complexity": "simple" | "medium" | "complex",
  "requiredCapabilities": ["data_query", "planning", "analysis"],
  "confidence": 0.95,
  "reasoning": "用户请求是简单的行程查询，只需要调用 places API"
}
`;
```

#### Routing Decision Prompt

```typescript
export const ROUTING_DECISION_PROMPT = `
[角色定位]

你是 TripNARA 智能体的路由决策专家。根据意图分析结果，决定使用 System 1（快速路径）还是 System 2（推理路径）。

[路由策略]

**System 1（快速路径）**：
- 简单查询（CRUD、事实查询）
- 单一 API 调用即可完成
- 响应时间 < 3 秒

**System 2（推理路径）**：
- 复杂规划（需要多步推理）
- 分析请求（需要调用多个分析 Skills）
- 决策请求（需要调用决策 Skills）

[输出格式]

{
  "route": "SYSTEM1_API" | "SYSTEM1_RAG" | "SYSTEM2_REASONING" | "SYSTEM2_ANALYSIS",
  "confidence": 0.95,
  "reasoning": "用户请求是简单的行程查询，使用 System 1 API 路径",
  "budget": {
    "max_seconds": 3,
    "max_steps": 1,
    "max_browser_steps": 0
  }
}
`;
```

#### Skills Selection Prompt

```typescript
export const SKILLS_SELECTION_PROMPT = `
[角色定位]

你是 TripNARA 智能体的 Skills 选择专家。根据用户意图和路由决策，选择最合适的 Skills。

[可用 Skills]

{availableSkills}

[选择原则]

1. **最小化原则**：只选择必要的 Skills
2. **效率原则**：优先选择快速、低成本的 Skills
3. **准确性原则**：对于关键决策，选择高准确性的 Skills

[输出格式]

{
  "selectedSkills": [
    {
      "skillName": "skill.analysis.pestAnalysis",
      "reason": "用户请求 PEST 分析",
      "priority": 1,
      "input": {
        "companyOrTopic": "TripNARA",
        "marketScope": "全球市场"
      }
    }
  ],
  "executionOrder": ["skill.analysis.pestAnalysis"],
  "dependencies": {}
}
`;
```

#### Execution Planning Prompt

```typescript
export const EXECUTION_PLANNING_PROMPT = `
[角色定位]

你是 TripNARA 智能体的执行计划编排专家。根据选择的 Skills，编排最优的执行计划。

[编排原则]

1. **依赖关系**：确保依赖的 Skills 先执行
2. **并行执行**：无依赖的 Skills 可以并行执行
3. **错误处理**：为每个步骤设计降级策略

[输出格式]

{
  "steps": [
    {
      "id": "step1",
      "type": "skill",
      "skillName": "skill.analysis.industryOverview",
      "dependencies": [],
      "parallel": false
    },
    {
      "id": "step2",
      "type": "skill",
      "skillName": "skill.analysis.competitiveLandscape",
      "dependencies": ["step1"],
      "parallel": false
    }
  ],
  "parallelGroups": [],
  "fallbackStrategy": {
    "onError": "continue",
    "retryCount": 1
  }
}
`;
```

---

## 🔄 迁移策略

### Phase 1: 并行运行（1-2周）

- 实现 `ClaudeOrchestratorService`
- 在 `AgentService` 中添加 Claude 编排选项（Feature Flag）
- 对比 Claude 编排和规则驱动的结果

```typescript
// AgentService
async routeAndRun(request: RouteAndRunRequestDto) {
  // Feature Flag
  if (process.env.USE_CLAUDE_ORCHESTRATION === 'true') {
    return this.claudeOrchestrator.orchestrate(request, context);
  } else {
    // 原有逻辑
    return this.legacyRouteAndRun(request);
  }
}
```

### Phase 2: 逐步迁移（2-4周）

- 先迁移简单场景（System 1 路径）
- 再迁移复杂场景（System 2 路径）
- 收集用户反馈和性能数据

### Phase 3: 完全切换（1-2周）

- 移除规则驱动的路由逻辑
- 优化 Claude 编排性能
- 完善错误处理和降级策略

---

## 📊 性能与成本考虑

### 性能优化

1. **缓存策略**
   - 缓存意图分析结果（相同请求复用）
   - 缓存路由决策（相似请求复用）
   - 缓存 Skills 选择结果

2. **并行执行**
   - 无依赖的 Skills 并行执行
   - 使用 Promise.all 批量执行

3. **快速路径**
   - 对于明确的简单请求，直接返回（不调用 Claude）
   - 只在复杂场景使用 Claude 编排

### 成本控制

1. **Token 预算**
   - 设置每次编排的 Token 预算上限
   - 使用更小的模型做简单决策（Claude Haiku）

2. **分层模型**
   - 意图分析：Claude Haiku（快速、低成本）
   - 复杂编排：Claude Sonnet（平衡性能与成本）
   - 关键决策：Claude Opus（高准确性）

3. **成本监控**
   - 记录每次编排的成本
   - 设置成本告警阈值
   - 生成成本报告

---

## ✅ 实施检查清单

### Phase 1: 基础实现

- [ ] 实现 `ClaudeOrchestratorService`
- [ ] 实现意图分析功能
- [ ] 实现路由决策功能
- [ ] 实现 Skills 选择功能
- [ ] 实现执行计划编排功能
- [ ] 添加 Feature Flag 支持

### Phase 2: 集成测试

- [ ] 单元测试（每个功能模块）
- [ ] 集成测试（完整流程）
- [ ] 性能测试（响应时间、成本）
- [ ] 对比测试（与规则驱动对比）

### Phase 3: 优化与迁移

- [ ] 实现缓存策略
- [ ] 实现并行执行
- [ ] 实现快速路径
- [ ] 实现成本监控
- [ ] 逐步迁移用户流量

---

## 🎯 预期收益

### 1. 用户体验提升

- **更准确的理解**：Claude 能理解复杂的用户意图
- **更智能的响应**：动态选择最合适的 Skills
- **更自然的交互**：支持多轮对话和上下文理解

### 2. 开发效率提升

- **统一编排**：所有逻辑集中在 Claude Orchestrator
- **易于扩展**：新增 Skills 只需注册，Claude 自动选择
- **易于维护**：减少规则代码，降低维护成本

### 3. 系统能力提升

- **整合分析类 Skills**：PEST、行业分析等可以无缝集成
- **动态适应**：根据用户反馈自动调整策略
- **持续优化**：通过 Claude 的推理能力不断优化编排逻辑

---

## 📝 总结

使用 Claude 编排智能体入口是一个**战略性的架构升级**，能够：

1. ✅ **提升用户体验**：更智能、更准确的理解和响应
2. ✅ **简化架构**：统一编排逻辑，减少规则代码
3. ✅ **增强能力**：整合新的分析类 Skills，扩展系统能力
4. ✅ **持续优化**：通过 Claude 的推理能力不断改进

**建议**：优先实施 Phase 1，通过并行运行验证效果，再逐步迁移。

---

**文档版本**：v1.0  
**创建日期**：2024-01-XX  
**作者**：AI Assistant  
**审核状态**：待技术团队审核
