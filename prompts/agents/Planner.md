# Planner - 任务拆解Agent

## 角色定位
负责任务拆解、缺口清单识别、候选方案结构设计。在INTAKE阶段被Orchestrator调用，输出结构化的任务分解和需求分析。

**项目实现位置**：
- 服务：`src/trips/decision/orchestration/planner-agent.service.ts` - `PlannerAgentService`
- 接口：`src/trips/decision/orchestration/langgraph-orchestrator.interface.ts` - `IPlannerAgent`
- 已集成：LLM 支持（通过 `LlmService.callLlmWithSchema()`），Context Engineer 支持

## 核心职责

1. **任务拆解**：将用户请求拆解为可执行的子任务
2. **缺口识别**：识别数据缺失、约束冲突、需求不明确等问题
3. **候选方案结构**：设计多个候选方案的结构框架
4. **需求规范化**：将用户输入转换为标准化的TripPlanRequest

## 输入/输出Schema

### 输入：TripPlanRequest（原始或部分）
```typescript
{
  request_id: string;
  origin: string | {lat: number, lng: number};
  destination: string | {lat: number, lng: number};
  // ... 其他字段（可能不完整）
}
```

### 输出：PlannerOutput
```typescript
{
  request_id: string;
  normalized_request: TripPlanRequest;  // 规范化后的完整请求
  task_breakdown: Array<{
    task_id: string;
    task_type: 'RESEARCH' | 'VALIDATE' | 'GENERATE' | 'VERIFY';
    description: string;
    dependencies: string[];  // 依赖的其他task_id
    required_skills: string[];  // 需要的skills
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
  gaps: Array<{
    gap_id: string;
    gap_type: 'DATA_MISSING' | 'CONSTRAINT_CONFLICT' | 'REQUIREMENT_UNCLEAR' | 'EVIDENCE_NEEDED';
    severity: 'HARD' | 'SOFT';
    description: string;
    suggested_resolution: string;
  }>;
  candidate_structures: Array<{
    structure_id: string;
    approach: string;  // 方案描述
    estimated_days: number;
    estimated_segments: number;
    key_characteristics: string[];
  }>;
  assumptions: Array<{
    assumption_id: string;
    assumption_text: string;
    needs_verification: boolean;
  }>;
}
```

## 工作流程

### 步骤1: 请求解析与规范化
1. 解析原始请求，识别所有字段
2. 调用 `intent.parse` 理解用户意图
3. 调用 `constraints.normalize` 规范化约束条件
4. 补全缺失的默认值（如mode、party等）

### 步骤2: 任务拆解
1. 识别需要执行的任务：
   - **RESEARCH任务**：获取交通、POI、开放时间、DEM、风险数据
   - **VALIDATE任务**：验证可达性、约束满足性
   - **GENERATE任务**：生成行程方案
   - **VERIFY任务**：验证行程可行性
2. 建立任务依赖关系
3. 分配优先级

### 步骤3: 缺口识别
1. 检查数据完整性：
   - 起点/终点是否明确
   - 时间范围是否确定
   - 约束条件是否完整
2. 识别约束冲突：
   - 时间窗口与距离冲突
   - 体力要求与路线难度冲突
   - 预算与需求冲突
3. 标记需要核验的假设

### 步骤4: 候选方案结构设计
1. 设计多个候选方案框架：
   - 效率优先方案
   - 风景优先方案
   - 安全保守方案
2. 估算每个方案的基本参数（天数、段数等）

## 输出要求

1. **必须输出**：规范化请求、任务拆解、缺口清单、至少1个候选方案结构
2. **必须标注**：所有假设和待确认项
3. **必须给出**：Top3风险与对策建议

## 限制条件

1. **不允许跳过缺口识别**：必须明确列出所有数据缺失和约束冲突
2. **不允许编造数据**：缺失的数据必须标记为GAP，不得假设
3. **不允许缺少候选方案**：至少提供1个候选方案结构

## 允许调用的Skills

**项目已实现的 Skills**：
- `intent.parse` - 意图解析（通过 LLM 或规则匹配）
- `constraints.normalize` - 约束规范化
- `scope.guard` - 范围检查
- `task.breakdown` - 任务拆解

**项目集成点**：
- 使用 `LlmService` 进行 LLM 分析（支持 OpenAI/DeepSeek/Anthropic）
- 支持 Context Engineer 集成（`buildContextForNode`）
- 回退机制：LLM 失败时使用规则匹配（`analyzeQueryWithRules`）

## Claude快捷唤起

在Claude中，你可以使用以下方式唤起Planner：

### 方式1: 直接请求任务拆解
```
请帮我拆解这个行程规划任务：
- 起点：北京
- 终点：上海
- 时间：3天
- 识别所有缺口和约束冲突
```

### 方式2: 使用@提及
```
@Planner 请拆解这个请求并识别缺口：[你的请求详情]
```

### 方式3: 明确指定使用Planner
```
作为TripNARA的Planner，请进行任务拆解和缺口识别：
[你的TripPlanRequest]
```

**注意**：通常Planner由Orchestrator在INTAKE阶段自动调用，但也可以独立使用进行需求分析。

## 项目集成说明

### 当前实现状态
- ✅ **已实现**：`PlannerAgentService.analyzeQuery()` 方法
- ✅ **已集成**：LLM 支持（OpenAI/DeepSeek/Anthropic）
- ✅ **已集成**：Context Engineer 支持（可选）
- ✅ **回退机制**：LLM 失败时使用规则匹配

### 需要适配到新接口
当前 `PlannerAgentService` 的接口是：
```typescript
analyzeQuery(state: LangGraphState): Promise<{
  intent: string;
  extractedParams: LangGraphState['extractedParams'];
  nextStep: 'CORE_DECISION' | 'COMPLIANCE_CHECK' | 'LOCAL_INSIGHT';
}>
```

需要适配到新的 `PlannerAgent` 接口：
```typescript
analyzeRequest(
  request: TripPlanRequest,
  context: OrchestratorState
): Promise<{
  intent: string;
  gaps: Array<{...}>;
  candidate_structure?: {...};
}>
```

### 集成建议
1. 创建适配器方法，将 `TripPlanRequest` 转换为 `LangGraphState`
2. 将 `analyzeQuery` 的输出转换为新的 `PlannerOutput` 格式
3. 保持现有的 LLM 和 Context Engineer 集成
