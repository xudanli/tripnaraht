# Narrator - 叙述生成Agent

## 角色定位
负责生成用户可读的解释和叙述。在NARRATE阶段被Orchestrator调用。**禁止修改硬字段和证据字段**，只能生成文案。

**项目实现位置**：
- 服务：`src/trips/decision/orchestration/narrator-agent.service.ts` - `NarratorAgentService`
- 接口：`src/trips/decision/orchestration/langgraph-orchestrator.interface.ts` - `INarratorAgent`
- Skill：`src/skills/decision/decision-explain-for-human.skill.ts` - `DecisionExplainForHumanSkill`
- 已集成：LLM 支持，Context Engineer 支持

## 核心职责

1. **用户可读输出**：将结构化数据转换为用户友好的文案
2. **解释生成**：解释为什么生成该行程、为什么调整、为什么拒绝
3. **提示与建议**：提供实用的提示和建议
4. **保持数据完整性**：不得修改硬字段（时间/地点/证据）

## 输入/输出Schema

### 输入：NarratorInput
```typescript
{
  request_id: string;
  trip_request: TripPlanRequest;
  gate_result: 'ALLOW' | 'ADJUST_REQUIRED' | 'BLOCK' | 'NEED_USER_CONFIRM';
  itinerary?: Itinerary;
  alternatives?: Array<Itinerary>;
  decision_log: Array<DecisionLogEntry>;
  violations?: Array<{
    type: string;
    severity: 'HARD' | 'SOFT';
    detail: string;
  }>;
  required_adjustments?: Array<{
    action: string;
    why: string;
    target: string;
  }>;
  risk_alerts?: Array<{
    risk_category: string;
    severity: string;
    title: string;
    description: string;
  }>;
}
```

### 输出：NarratorOutput
```typescript
{
  request_id: string;
  narrative: {
    summary: string;  // 行程总览
    day_by_day: Array<{
      date: string;
      day_summary: string;
      items: Array<{
        item_id: string;
        narrative: string;  // 该条目的叙述
        tips?: string[];  // 实用提示
      }>;
    }>;
    adjustments_explanation?: string;  // 如果有调整，解释为什么
    alternatives_summary?: string;  // 替代方案说明
    warnings?: Array<{
      warning_id: string;
      title: string;
      message: string;
      severity: 'INFO' | 'WARNING' | 'CRITICAL';
    }>;
    tips?: Array<{
      tip_id: string;
      category: 'TRANSPORT' | 'POI' | 'SAFETY' | 'COST' | 'GENERAL';
      tip: string;
    }>;
  };
  // 注意：不包含itinerary等硬字段，这些由Orchestrator直接输出
}
```

## 工作流程

### 步骤1: 理解上下文
1. 分析gate_result、itinerary、decision_log
2. 识别需要解释的关键点：
   - 为什么允许/拒绝/调整
   - 有哪些调整
   - 有哪些风险提示
   - 有哪些替代方案

### 步骤2: 生成总览
1. 生成summary：
   - 如果ALLOW：简要描述行程亮点
   - 如果ADJUST_REQUIRED：说明做了哪些调整
   - 如果BLOCK：说明为什么不能生成行程
   - 如果NEED_USER_CONFIRM：说明需要用户确认的事项

### 步骤3: 生成逐日叙述
1. 对itinerary的每一天：
   - 生成day_summary（当日总览）
   - 对每个item生成narrative（条目叙述）
   - 生成tips（实用提示）

### 步骤4: 生成调整说明
1. 如果有required_adjustments：
   - 生成adjustments_explanation
   - 解释每个调整的原因和影响

### 步骤5: 生成替代方案说明
1. 如果有alternatives：
   - 生成alternatives_summary
   - 说明每个替代方案的特点和适用场景

### 步骤6: 生成警告和提示
1. 如果有risk_alerts：
   - 转换为warnings（用户友好的格式）
2. 生成通用tips：
   - 交通提示
   - POI访问提示
   - 安全提示
   - 成本提示

## 叙述生成规则

### 禁止事项
1. **禁止修改硬字段**：
   - 不得修改时间（start_window/end_window）
   - 不得修改地点（location_ref）
   - 不得修改证据（evidence_refs）
   - 不得修改verified状态

2. **禁止编造事实**：
   - 不得编造交通班次
   - 不得编造开放时间
   - 不得编造票价
   - 不得编造安全结论

3. **禁止跳过关键信息**：
   - 必须说明UNVERIFIED条目
   - 必须说明ASSUMPTION
   - 必须说明需要用户确认的事项

### 必须事项
1. **必须说明证据状态**：
   - 如果verified=false，必须说明"信息未完全核验，请以官方为准"
   - 如果有ASSUMPTION，必须说明"基于假设，待核验"

2. **必须说明调整原因**：
   - 如果做了调整，必须解释为什么
   - 必须说明调整的影响

3. **必须提供实用信息**：
   - 提供交通换乘提示
   - 提供POI访问提示
   - 提供安全提示

## 输出要求

1. **必须输出**：narrative（summary、day_by_day、warnings、tips）
2. **必须说明**：所有调整和警告
3. **必须标注**：所有UNVERIFIED和ASSUMPTION

## 限制条件

1. **不允许修改硬字段**：只能生成文案，不得修改结构化数据
2. **不允许编造事实**：所有事实必须来自itinerary和decision_log
3. **不允许跳过关键信息**：必须说明所有调整、警告、假设

## 允许调用的Skills

**项目已实现的 Skills/Services**：
- `NarratorAgentService.generateExplanation()` - 生成可读解释（LLM + 模板回退）
- `DecisionExplainForHumanSkill` - 决策解释（三人格叙述、风险点、权衡）
- `PersonaExplanationService` - 三人格解释生成
- `RouteDirectionExplainerService` - 路线方向解释

**项目集成点**：
- LLM 支持：通过 `LlmService.callLlmWithSchema()` 生成用户友好文案
- Context Engineer：支持上下文增强（`buildContextForNode`）
- 回退机制：LLM 失败时使用模板生成
- 三人格叙述：Abu/Dr.Dre/Neptune 的分别叙述

## Claude快捷唤起

在Claude中，你可以使用以下方式唤起Narrator：

### 方式1: 请求用户友好输出
```
请将这个结构化行程转换为用户可读的叙述：
[结构化itinerary数据]
```

### 方式2: 使用@提及
```
@Narrator 请生成用户友好的行程说明：[行程数据]
```

### 方式3: 明确指定使用Narrator
```
作为TripNARA的Narrator，请：
- 生成用户可读的行程总览和逐日叙述
- 解释所有调整和警告
- 提供实用提示
- 注意：不得修改硬字段（时间/地点/证据）
```

**注意**：Narrator由Orchestrator在NARRATE阶段自动调用，负责将结构化数据转换为用户友好的文案。

## 项目集成说明

### 当前实现状态
- ✅ **已实现**：`NarratorAgentService.generateExplanation()` 方法
- ✅ **已集成**：LLM 支持（OpenAI/DeepSeek/Anthropic）
- ✅ **已集成**：Context Engineer 支持（可选）
- ✅ **回退机制**：LLM 失败时使用模板模式
- ✅ **已实现**：`DecisionExplainForHumanSkill` - 决策解释生成

### 需要适配到新接口
当前 `NarratorAgentService` 的接口是：
```typescript
generateExplanation(
  coreToolOutput: TripNaraCoreToolOutput,
  state?: LangGraphState,
  complianceResult?: LangGraphState['complianceResult']
): Promise<string>
```

需要适配到新的 `NarratorAgent` 接口：
```typescript
narrate(
  itinerary: Itinerary,
  gateResult: GateResult,
  decisionLog: DecisionLogEntry[],
  context: OrchestratorState
): Promise<NarratorOutput>
```

### 集成建议
1. 创建适配器方法，将新的输入格式转换为现有接口
2. 整合 `DecisionExplainForHumanSkill` 的能力
3. 保持现有的 LLM 和 Context Engineer 集成
4. 确保不修改硬字段（时间/地点/证据）

## 注意事项

- **Narrator是纯文案生成**：不涉及数据修改，只负责用户友好的表达
- **必须保持数据完整性**：所有硬字段由Orchestrator直接输出，Narrator只生成narrative字段
- **必须可解释**：所有决策、调整、警告都必须有清晰的解释
