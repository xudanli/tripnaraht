# 健康度指标计算逻辑梳理

**创建日期**: 2026-02-10  
**状态**: ✅ 已梳理

---

## 📊 指标映射关系

前端显示的四个圆形指标与后端API返回的维度映射关系：

| 前端显示 | 后端维度 | 英文标识 | 权重 |
|---------|---------|---------|------|
| **可执行度** | 时间安排 | `schedule` | 0.30 (30%) |
| **成本** | 预算 | `budget` | 0.25 (25%) |
| **风险** | 节奏 | `pace` | 0.25 (25%) |
| **缓冲** | 可达性 | `feasibility` | 0.20 (20%) |

**注意**: 前端可能使用不同的命名，但后端统一使用 `schedule`, `budget`, `pace`, `feasibility` 四个维度。

---

## 🔍 各维度详细计算逻辑

### 1. 可执行度 (Schedule) - 时间安排

**代码位置**: `src/skills/detail/detail-analyze-health.skill.ts:115-175`

**基础分**: 100分

**扣分规则**:

1. **时间冲突检测** (主要扣分项)
   - 数据来源: `TripConflictsService.getConflicts(tripId)`，过滤 `ConflictType.TIME_CONFLICT`
   - 扣分公式: **根据冲突严重程度差异化扣分**（方案C）
     - HIGH（红线）级别: 每个扣 **25 分**
     - MEDIUM（警告）级别: 每个扣 **15 分**
     - LOW（信息）级别: 每个扣 **5 分**
   - 最大扣分: `最多扣 90 分`
   - 示例:
     ```typescript
     // 1个红线冲突: 100 - 25 = 75分
     // 4个红线冲突: 100 - 90 = 10分（最多扣90分）
     // 2个红线 + 1个警告: 100 - (25+25+15) = 35分
     ```

2. **时间窗不足** (次要扣分项)
   - 数据来源: `planState.pace.timeWindows`
   - 判断条件: 可用时间窗 < 6小时（`end - start < 6`）
   - 扣分公式: `每天不足扣 10 分`
   - 示例:
     ```typescript
     // 2天时间窗不足: 100 - 20 = 80分
     ```

**状态判定**:
- `healthy`: score ≥ 70
- `warning`: 50 ≤ score < 70
- `critical`: score < 50

**问题描述生成**:
- 1个冲突: `"1 个时间冲突：{冲突描述}"`
- 多个冲突: `"{数量} 个时间冲突"` + 前3个详细描述

---

### 2. 成本 (Budget) - 预算

**代码位置**: `src/skills/detail/detail-analyze-health.skill.ts:177-195`

**基础分**: 100分

**扣分规则**:

1. **预算超支检测**
   - 数据来源: `planState.budget.overrun.overrunAmount` 和 `planState.constraints.budget.total`
   - 超支比例计算: `overrunRatio = overrunAmount / totalBudget`
   - 扣分规则:
     - 超支 > 20%: `扣 50 分`
     - 超支 > 10%: `扣 30 分`
     - 超支 ≤ 10%: `不扣分`
   - 示例:
     ```typescript
     // 超支25%: 100 - 50 = 50分
     // 超支15%: 100 - 30 = 70分
     // 超支5%: 100 - 0 = 100分
     ```

**状态判定**:
- `healthy`: score ≥ 70
- `warning`: 50 ≤ score < 70
- `critical`: score < 50

**问题描述生成**:
- `"预算超支 {百分比}%"`

---

### 3. 风险 (Pace) - 节奏

**代码位置**: `src/skills/detail/detail-analyze-health.skill.ts:197-215`

**基础分**: 100分

**扣分规则**:

1. **疲劳评分检测**
   - 数据来源: `planState.pace.fatigueScore.paceScore` (0-100)
   - 扣分规则:
     - 疲劳分 > 85: `扣 40 分`
     - 疲劳分 > 70: `扣 20 分`
     - 疲劳分 ≤ 70: `不扣分`
   - 示例:
     ```typescript
     // 疲劳分90: 100 - 40 = 60分
     // 疲劳分75: 100 - 20 = 80分
     // 疲劳分65: 100 - 0 = 100分
     ```

**状态判定**:
- `healthy`: score ≥ 70
- `warning`: 50 ≤ score < 70
- `critical`: score < 50

**问题描述生成**:
- `"疲劳评分过高: {分数}/100"` (当 > 85)
- `"疲劳评分略高: {分数}/100"` (当 > 70)

---

### 4. 缓冲 (Feasibility) - 可达性

**代码位置**: `src/skills/detail/detail-analyze-health.skill.ts:217-235`

**基础分**: 100分

**扣分规则**:

1. **不可达段检测**
   - 数据来源: `planState.mobility.transferSegments`
   - 判断条件: `seg.feasibility === 'infeasible'`
   - 扣分公式: `每段不可达扣 30 分`
   - 示例:
     ```typescript
     // 1段不可达: 100 - 30 = 70分
     // 2段不可达: 100 - 60 = 40分
     // 3段不可达: 100 - 90 = 10分
     ```

**状态判定**:
- `healthy`: score ≥ 70
- `warning`: 50 ≤ score < 70
- `critical`: score < 50

**问题描述生成**:
- `"{数量} 段不可达"`

---

## 🎯 总体健康度计算

**代码位置**: `src/skills/detail/detail-analyze-health.skill.ts:79-94`

**计算方法**: **加权平均**（不是简单平均，也不是木桶效应）

**权重分配**:
```typescript
const dimensionWeights = {
  schedule: 0.30,    // 时间安排最重要
  budget: 0.25,      // 预算次重要
  pace: 0.25,        // 节奏同样重要
  feasibility: 0.20  // 可达性相对次要（因为可以调整）
};
```

**计算公式**:
```typescript
const overallScore = 
  schedule.score * 0.30 +
  budget.score * 0.25 +
  pace.score * 0.25 +
  feasibility.score * 0.20;
```

**状态判定**:
- `healthy`: overallScore ≥ 70
- `warning`: 50 ≤ overallScore < 70
- `critical`: overallScore < 50

**示例计算**:
```typescript
// 假设各维度分数：
// schedule: 82分 (1个时间冲突)
// budget: 100分 (无超支)
// pace: 80分 (疲劳分75)
// feasibility: 100分 (无不可达段)

// 总体健康度 = 82*0.30 + 100*0.25 + 80*0.25 + 100*0.20
//            = 24.6 + 25 + 20 + 20
//            = 89.6分
// 状态: healthy (≥70)
```

---

## 📝 数据来源说明

### Schedule (可执行度)
- **时间冲突**: `TripConflictsService.getConflicts(tripId)` → 过滤 `TIME_CONFLICT`
- **时间窗**: `planState.pace.timeWindows`

### Budget (成本)
- **预算超支**: `planState.budget.overrun.overrunAmount` / `planState.constraints.budget.total`

### Pace (风险)
- **疲劳评分**: `planState.pace.fatigueScore.paceScore`

### Feasibility (缓冲)
- **不可达段**: `planState.mobility.transferSegments` → 过滤 `feasibility === 'infeasible'`

---

## 🔄 API 接口

### GET `/api/trip-detail/:tripId/health`

**返回结构**:
```json
{
  "success": true,
  "data": {
    "overall": "healthy" | "warning" | "critical",
    "overallScore": 78,  // 0-100，总体健康度分数（用于前端显示百分比）
    "dimensions": {
      "schedule": {
        "status": "healthy" | "warning" | "critical",
        "score": 82,
        "issues": ["1 个时间冲突：..."],
        "weight": 0.30
      },
      "budget": {
        "status": "healthy",
        "score": 100,
        "issues": [],
        "weight": 0.25
      },
      "pace": {
        "status": "healthy",
        "score": 80,
        "issues": [],
        "weight": 0.25
      },
      "feasibility": {
        "status": "healthy",
        "score": 100,
        "issues": [],
        "weight": 0.20
      }
    }
  }
}
```

### GET `/api/trip-detail/:tripId/metrics/:dimension/explanation`

**支持的 dimension**: `schedule`, `budget`, `pace`, `feasibility`

**返回结构**:
```json
{
  "success": true,
  "data": {
    "metricName": "schedule",
    "displayName": "时间灵活性",
    "dimension": "schedule",
    "dimensionName": "时间安排",
    "description": "评估行程的时间安排是否合理，包括时间冲突、可用时间窗等",
    "definition": "评估行程的时间安排是否合理，包括时间冲突、可用时间窗等",
    "currentScore": 82,
    "currentStatus": "healthy",
    "overallStatus": "healthy",
    "calculationMethod": "基础分100分，时间窗不足每天扣10分",
    "calculation": {
      "method": "基础分100分，时间窗不足每天扣10分",
      "score": 82
    },
    "idealRange": "70-100分（健康），50-69分（警告），0-49分（严重）",
    "currentState": {
      "score": 82,
      "status": "healthy",
      "issues": ["1 个时间冲突：..."]
    },
    "issues": ["1 个时间冲突：..."],
    "suggestions": ["增加可用时间窗", "减少每日活动数量", "调整活动时间安排"],
    "impact": "low" | "medium" | "high",
    "weight": 0.30,
    "contribution": 24.6,
    "lastUpdated": "2026-02-10T10:00:00.000Z"
  }
}
```

---

## ⚠️ 注意事项

1. **时间冲突检测**: 
   - 需要 `TripConflictsService` 注入才能检测
   - 如果服务未注入，会记录警告但不影响其他检查
   - 时间冲突检测是异步的，需要 `await`

2. **数据依赖**:
   - 所有计算都依赖 `planState` 数据
   - 如果 `planState` 为空或不完整，可能无法准确计算

3. **分数范围**:
   - 所有维度分数范围: `0-100`
   - 使用 `Math.max(0, score)` 确保不低于0
   - 总体健康度范围: `0-100`（加权平均）

4. **权重来源**:
   - 权重定义在代码中硬编码（`dimensionWeights`）
   - 参考文档: `.claude/product-decisions/trip-detail-page-key-decisions.md`
   - 权重用于计算总体健康度和指标详细说明中的 `contribution`

---

## 📚 相关文档

- **产品决策**: `.claude/product-decisions/trip-detail-page-key-decisions.md`
- **API文档**: `src/trips/TRIP_DETAIL_API_DOCUMENTATION.md`
- **实现总结**: `scripts/HEALTH_SCORE_TIME_CONFLICT_FIX.md`
- **权重总结**: `scripts/HEALTH_SCORE_WEIGHTS_SUMMARY.md`

---

## 🔍 调试建议

如果发现健康度显示异常（如显示100%但实际有问题），检查：

1. **时间冲突是否被检测**:
   ```typescript
   // 检查 TripConflictsService 是否注入
   // 检查 getConflicts 是否返回了 TIME_CONFLICT
   ```

2. **planState 数据是否完整**:
   ```typescript
   // 检查 planState.budget.overrun
   // 检查 planState.pace.fatigueScore
   // 检查 planState.mobility.transferSegments
   ```

3. **分数计算是否正确**:
   ```typescript
   // 检查各维度 score 是否在 0-100 范围内
   // 检查总体健康度是否使用了加权平均
   ```

4. **权重是否正确应用**:
   ```typescript
   // 检查 dimensionWeights 是否为 {schedule: 0.30, budget: 0.25, pace: 0.25, feasibility: 0.20}
   // 检查 contribution 是否为 score * weight
   ```
