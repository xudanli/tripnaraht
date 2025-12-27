# TripNARA System Prompt 集成指南

## 概述

TripNARA System Prompt 定义了 Agent 的人格、世界观和决策宪法。本文档说明如何在代码中集成和使用它。

## 文件结构

```
docs/
  ├── TRIPNARA_SYSTEM_PROMPT.md          # 完整的系统提示文档
  └── TRIPNARA_SYSTEM_PROMPT_INTEGRATION.md  # 本集成指南

src/agent/services/
  └── tripnara-system-prompt.service.ts  # 系统提示服务
```

## 使用方法

### 1. 在 Agent 服务中注入

```typescript
import { TripNaraSystemPromptService } from './services/tripnara-system-prompt.service';

@Injectable()
export class YourAgentService {
  constructor(
    private readonly systemPromptService: TripNaraSystemPromptService
  ) {}

  async generateResponse(userInput: string) {
    // 获取完整系统提示
    const systemPrompt = this.systemPromptService.getSystemPrompt();
    
    // 或者获取特定场景的提示
    const planningPrompt = this.systemPromptService.getPromptForScenario('planning');
    
    // 在 LLM 调用时使用
    const fullPrompt = `${systemPrompt}\n\n用户输入：${userInput}`;
    // ... 调用 LLM
  }
}
```

### 2. 在决策引擎中引用

```typescript
// src/trips/decision/trip-decision-engine.service.ts

// 在生成计划时，确保遵循决策顺序
async generatePlan(state: TripWorldState) {
  // 1. 国家/区域识别
  const countryCode = this.extractCountryCode(state.context.destination);
  
  // 2. 季节判断
  const month = this.extractMonth(state.context.startDate);
  
  // 3. RouteDirection 选择
  const recommendations = await this.routeDirectionSelector.pickRouteDirections(...);
  const selectedRouteDirection = recommendations[0];
  
  // 4. 约束注入
  this.injectConstraints(state, selectedRouteDirection.constraints);
  
  // 5. POI 生成
  const routePois = await this.routeDirectionPoiGenerator.generateCandidatePois(...);
  
  // 6. 策略执行
  const abu = abuSelectCoreActivities(...);
  const slots = await drdreBuildDaySchedule(...);
  
  // 7. 解释生成
  const explainer = this.explainerService.generateExplainer(selectedRouteDirection);
  // ...
}
```

### 3. 在 LlmPlanService 中注入（已实现）

```typescript
// src/agent/services/llm-plan-service.ts

import { TripNaraSystemPromptService } from './tripnara-system-prompt.service';

@Injectable()
export class LlmPlanService {
  constructor(
    private llmService: LlmService,
    private actionRegistry: ActionRegistryService,
    @Optional() private systemPromptService?: TripNaraSystemPromptService,
  ) {}

  private buildPrompt(state: AgentState): string {
    // 自动注入 TripNARA 系统提示
    const systemPrompt = this.systemPromptService?.getSystemPrompt() || '';
    const systemPromptSection = systemPrompt 
      ? `\n\n---\n\n${systemPrompt}\n\n---\n\n`
      : '';
    
    return `${systemPromptSection}你是一个智能旅行规划助手（TripNARA）...`;
  }
}
```

**注意**：系统提示会自动注入到所有 LLM Plan 的 prompt 中，无需额外配置。

### 4. 在 LLM 服务中使用

```typescript
// src/llm/services/llm.service.ts

import { TripNaraSystemPromptService } from '../../agent/services/tripnara-system-prompt.service';

@Injectable()
export class LlmService {
  constructor(
    private readonly systemPromptService: TripNaraSystemPromptService
  ) {}

  async chat(messages: ChatMessage[], options?: LlmOptions) {
    // 如果是旅行规划相关的请求，注入系统提示
    if (this.isTravelPlanningRequest(messages)) {
      const systemPrompt = this.systemPromptService.getSystemPrompt();
      const systemMessage: ChatMessage = {
        role: 'system',
        content: systemPrompt,
      };
      messages = [systemMessage, ...messages];
    }
    
    // ... 调用 LLM API
  }
}
```

## API 参考

### TripNaraSystemPromptService

#### `getSystemPrompt(): string`
获取完整的系统提示。

#### `getCompactSystemPrompt(): string`
获取精简版系统提示（用于 token 限制场景）。

#### `getPromptForScenario(scenario: 'planning' | 'repair' | 'explanation'): string`
获取特定场景的系统提示。

#### `getDecisionStagePrompt(stage: 'route_selection' | 'constraint_injection' | 'poi_generation' | 'strategy_execution'): string`
获取特定决策阶段的提示片段。

## 集成检查清单

- [x] 在 `AgentModule` 中注册 `TripNaraSystemPromptService`
- [x] 在 `LlmPlanService` 中注入并使用系统提示（在构建 prompt 时自动注入）
- [x] 在 `OrchestratorService` 中注入系统提示服务（为将来扩展做准备）
- [ ] 在 `LlmService` 中为旅行规划请求注入系统提示（可选，当前主要用于特定任务）
- [x] 在 `TripDecisionEngineService` 中确保遵循决策顺序（已实现）
- [x] 在 `RouteDirectionExplainerService` 中确保输出可解释性信息（已实现）
- [x] 在 `DecisionRunLog` 中记录决策过程（已实现）

## 验证

### 1. 检查决策顺序

确保 `TripDecisionEngineService.generatePlan()` 按照以下顺序执行：

1. ✅ 国家/区域识别
2. ✅ 季节判断
3. ✅ RouteDirection 选择
4. ✅ 约束注入
5. ✅ POI 生成
6. ✅ 策略执行（Abu → Dr.Dre → Neptune）
7. ✅ 解释生成

### 2. 检查可解释性输出

确保输出包含：

- ✅ 选中 RouteDirection 的原因
- ✅ Top 2 被淘汰方向 + 原因
- ✅ 当前路线的主要风险点
- ✅ 若条件变化应如何调整

### 3. 检查约束系统

确保：

- ✅ 硬约束违反时阻止或降级
- ✅ 软约束违反时优先拆天/加缓冲
- ✅ 目标权重只用于优化，不突破硬现实

## 示例

### 示例 1：在规划请求中使用

```typescript
// 用户输入："我想去冰岛7天，喜欢摄影和自然风光"

// Agent 应该：
// 1. 识别国家：IS (Iceland)
// 2. 判断季节：根据出发日期
// 3. 选择 RouteDirection：FJORD_COASTLINE_DRIVING（峡湾/海岸线自驾）
// 4. 注入约束：maxElevationM: 2000, maxSlopePct: 15
// 5. 生成 POI：在海岸线走廊内的摄影点和自然景观
// 6. 执行策略：Abu 选择核心体验，Dr.Dre 安排时间轴
// 7. 生成解释：为什么选择海岸线路线，风险点（天气窗口），调整建议
```

### 示例 2：在修复请求中使用

```typescript
// 用户输入："第3天的活动因为天气取消了，怎么办？"

// Agent 应该：
// 1. 使用 Neptune 策略进行最小改动修复
// 2. 在走廊内寻找替代 POI
// 3. 保持时间轴结构不变
// 4. 解释修复原因和替代方案
```

## 注意事项

1. **不要跳过决策步骤**：严格按照决策顺序执行
2. **不要编造信息**：所有路线和 POI 必须真实存在
3. **不要忽略约束**：硬约束必须遵守，软约束优先调整
4. **必须可解释**：每个关键决策都要有理由

## 故障排查

### 问题：系统提示未加载

**原因**：文件路径不正确或文件不存在

**解决**：
1. 检查 `docs/TRIPNARA_SYSTEM_PROMPT.md` 是否存在
2. 如果不存在，服务会使用内嵌版本（fallback）

### 问题：Token 超限

**原因**：完整系统提示太长

**解决**：使用 `getCompactSystemPrompt()` 或 `getDecisionStagePrompt()`

### 问题：Agent 不遵循决策顺序

**原因**：系统提示未正确注入

**解决**：
1. 检查 `OrchestratorService` 是否正确注入提示
2. 检查 LLM 调用时是否包含系统消息
3. 验证决策引擎是否按照顺序执行

## 更新日志

- **v1.0.0** (2024): 初始版本，定义 TripNARA 系统提示和集成指南

