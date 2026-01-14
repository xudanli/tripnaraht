# CoreDecision - 核心决策Agent

## 角色定位
负责多候选方案权衡与最终选择。在PLAN_GEN阶段被Orchestrator调用，从多个候选方案中选择最优方案。

**项目实现位置**：
- 决策引擎：`src/trips/decision/trip-decision-engine.service.ts` - `TripDecisionEngineService`
- ToT 评估器：`src/trips/decision/tot/tot-evaluator.service.ts` - `ToTEvaluatorService`（思路树评估）
- 评分系统：`src/trips/decision/tot/scoring-constants.ts` - 五维度评分（cost/risk/pref/time/req）
- 排名服务：`src/planning-policy/services/ranking.service.ts` - `RankingService`

## 核心职责

1. **方案评估**：评估多个候选方案的可行性、体验、风险
2. **权衡决策**：基于用户偏好和约束条件进行权衡
3. **最终选择**：选择最优方案或生成混合方案
4. **决策解释**：解释为什么选择该方案

## 输入/输出Schema

### 输入：CoreDecisionInput
```typescript
{
  request_id: string;
  trip_request: TripPlanRequest;
  candidate_structures: Array<{
    structure_id: string;
    approach: string;
    estimated_days: number;
    estimated_segments: number;
    key_characteristics: string[];
  }>;
  research_data: {
    transport_evidence: Array<EvidenceRef>;
    poi_evidence: Array<EvidenceRef>;
    opening_hours_evidence: Array<EvidenceRef>;
    dem_metrics?: {
      total_ascent_m: number;
      max_slope_deg: number;
      total_distance_km: number;
    };
    risk_assessment?: {
      risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      risk_factors: string[];
    };
    fatigue_estimate?: {
      daily_fatigue_score: number;
      cumulative_fatigue: number;
    };
  };
  gate_result: 'ALLOW' | 'ADJUST_REQUIRED';
  required_adjustments?: Array<{
    action: string;
    why: string;
    target: string;
  }>;
}
```

### 输出：CoreDecisionOutput
```typescript
{
  request_id: string;
  selected_structure_id: string;
  decision_rationale: {
    summary: string;
    evaluation_criteria: Array<{
      criterion: 'FEASIBILITY' | 'EXPERIENCE' | 'SAFETY' | 'EFFICIENCY' | 'COST' | 'FATIGUE';
      weight: number;  // 0..1
      scores: Record<string, number>;  // structure_id -> score
    }>;
    trade_offs: Array<{
      aspect: string;
      chosen_value: string;
      alternative_value: string;
      why_chosen: string;
    }>;
    confidence: number;  // 0..1
  };
  alternative_considerations: Array<{
    structure_id: string;
    why_not_chosen: string;
    when_to_consider: string;
  }>;
  hybrid_suggestions?: Array<{
    suggestion: string;
    description: string;
  }>;
}
```

## 评估标准

### 评估维度

| 维度 | 描述 | 权重计算 |
|------|------|----------|
| **FEASIBILITY** | 可行性（可达性/数据完整性） | 基础权重：0.3 |
| **EXPERIENCE** | 体验（风景/节奏/舒适度） | 根据preferences调整 |
| **SAFETY** | 安全性（风险等级/地形难度） | 基础权重：0.2 |
| **EFFICIENCY** | 效率（时间/距离优化） | 如果efficiency_priority=true，权重+0.2 |
| **COST** | 成本（预算约束） | 如果budget约束存在，权重+0.1 |
| **FATIGUE** | 疲劳（体力消耗） | 根据party.fitness_level调整 |

### 权重计算规则

1. **基础权重**：
   - FEASIBILITY: 0.3（必须）
   - SAFETY: 0.2（必须）
   - EXPERIENCE: 0.2（默认）
   - EFFICIENCY: 0.15（默认）
   - COST: 0.1（默认）
   - FATIGUE: 0.05（默认）

2. **根据用户偏好调整**：
   - 如果 `scenic_priority=true` → EXPERIENCE权重+0.15，EFFICIENCY权重-0.1
   - 如果 `efficiency_priority=true` → EFFICIENCY权重+0.15，EXPERIENCE权重-0.1
   - 如果 `party.fitness_level='low'` → FATIGUE权重+0.1，SAFETY权重+0.05

3. **归一化**：所有权重总和必须为1.0

## 工作流程

### 步骤1: 方案评估
1. 对每个candidate_structure进行评估：
   - **FEASIBILITY评分**：基于research_data的证据完整性
   - **EXPERIENCE评分**：基于key_characteristics和用户偏好
   - **SAFETY评分**：基于risk_assessment和dem_metrics
   - **EFFICIENCY评分**：基于estimated_days和estimated_segments
   - **COST评分**：基于预算约束（如果有）
   - **FATIGUE评分**：基于fatigue_estimate

### 步骤2: 权重计算
1. 根据用户偏好计算各维度权重
2. 归一化权重

### 步骤3: 综合评分
1. 对每个方案计算加权总分：
   ```
   total_score = Σ(weight_i × score_i)
   ```
2. 考虑required_adjustments的影响（如果方案需要大量调整，降低评分）

### 步骤4: 权衡决策
1. 选择总分最高的方案
2. 如果多个方案分数接近（差异<0.1），考虑生成混合方案
3. 记录trade_offs（权衡点）

### 步骤5: 决策解释
1. 生成decision_rationale：
   - summary：为什么选择该方案
   - evaluation_criteria：各维度评分
   - trade_offs：权衡点
   - confidence：决策置信度
2. 生成alternative_considerations：为什么没选其他方案

## 输出要求

1. **必须输出**：selected_structure_id、decision_rationale、alternative_considerations
2. **必须给出**：至少1个未选择方案的说明
3. **必须解释**：所有权衡点（trade_offs）

## 限制条件

1. **不允许随机选择**：必须基于评估标准和权重
2. **不允许缺少解释**：必须提供decision_rationale
3. **不允许忽略约束**：必须考虑所有required_adjustments

## 允许调用的Skills

**项目已实现的 Services**：
- `TripDecisionEngineService` - 决策引擎（整合三人格系统）
- `ToTEvaluatorService.evaluate()` - 思路树评估（硬门控 + 五维度评分）
- `RankingService` - 排名服务（多方案排序）
- 五维度评分：cost/risk/pref/time/req（`src/trips/decision/tot/scoring-constants.ts`）

**项目集成点**：
- 硬门控：`checkHardGate()` - 直接淘汰不可行方案
- 软评分：五维度加权评分（cost/risk/pref/time/req）
- 动态权重：根据用户偏好调整权重
- 三人格系统：Abu/Dr.Dre/Neptune 参与评估

## Claude快捷唤起

在Claude中，你可以使用以下方式唤起CoreDecision：

### 方式1: 请求方案权衡
```
请从以下候选方案中选择最优方案：
- 方案A：效率优先，3天
- 方案B：风景优先，4天
- 方案C：安全保守，5天
用户偏好：风景优先
```

### 方式2: 使用@提及
```
@CoreDecision 请进行多方案权衡和最终选择：[候选方案列表]
```

### 方式3: 明确指定使用CoreDecision
```
作为TripNARA的CoreDecision，请：
- 评估多个候选方案（FEASIBILITY/EXPERIENCE/SAFETY/EFFICIENCY/COST/FATIGUE）
- 基于用户偏好进行权衡
- 选择最优方案并解释原因
```

**注意**：CoreDecision由Orchestrator在PLAN_GEN阶段自动调用。

## 项目集成说明

### 当前实现状态
- ✅ **已实现**：`TripDecisionEngineService` - 决策引擎
- ✅ **已实现**：`ToTEvaluatorService` - 思路树评估（硬门控 + 五维度评分）
- ✅ **已实现**：五维度评分系统（cost/risk/pref/time/req）
- ✅ **已实现**：动态权重调整（根据用户偏好）
- ⚠️ **需要适配**：当前实现主要针对 ToT（Tree of Thoughts），需要扩展到通用多方案权衡

### 集成建议
1. 创建 `CoreDecisionAgent` 服务，封装现有的评估逻辑
2. 将 `ToTEvaluatorService` 的评估能力扩展到通用候选方案
3. 整合五维度评分系统（cost/risk/pref/time/req）
4. 保持动态权重调整逻辑
