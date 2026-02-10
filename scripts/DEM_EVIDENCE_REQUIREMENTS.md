# DEM 证据要求文档

## 概述

DEM（Digital Elevation Model，数字高程模型）证据是**强制性的决策证据源**，用于否决或修正计划。没有 DEM 证据的计划不允许 finalize。

## 强制规则

根据代码中的强制规则（写进代码，不写进文档）：

1. ❌ **没有 DEM evidence → plan 不可 finalize**
2. ❌ **Neptune 不允许修复没有 DEM evidence 的 segment**
3. ❌ **Abu 不允许忽略 HARD violation**

## 数据结构要求

### DemDecisionEvidence 接口

```typescript
interface DemDecisionEvidence {
  /** 路段 ID（用于关联到具体路段）- 必需 */
  segmentId: string;
  
  /** 海拔剖面（米）- 必需，数组 */
  elevationProfile: number[];
  
  /** 累计爬升（米）- 必需 */
  cumulativeAscent: number;
  
  /** 最大坡度（百分比）- 必需 */
  maxSlopePct: number;
  
  /** 3天滚动窗口累计爬升（米）- 必需，用于连续疲劳检测 */
  rollingAscent3Days: number;
  
  /** 疲劳指数（0-100，归一化）- 必需 */
  fatigueIndex: number;
  
  /** 违规类型 - 必需，枚举值 */
  violation: 'HARD' | 'SOFT' | 'NONE';
  
  /** 解释（用于可解释失败）- 必需 */
  explanation: string;
  
  /** 额外元数据 - 可选 */
  metadata?: {
    /** 连续高海拔天数 */
    consecutiveHighAltitudeDays?: number;
    /** 平均坡度（百分比） */
    avgSlopePct?: number;
    /** 距离（米） */
    distanceM?: number;
    /** 海拔变化范围（米） */
    elevationRange?: {
      min: number;
      max: number;
    };
    /** 关键断点（如过陡段起始位置） */
    criticalBreakpoints?: Array<{
      distance: number;
      reason: string;
      severity: 'LOW' | 'MEDIUM' | 'HIGH';
    }>;
  };
}
```

## 验证要求

### 1. 基本存在性验证

```typescript
// 验证计划是否有 DEM 证据
validatePlanHasEvidence(plan: TripPlan, evidences: DemDecisionEvidence[]): {
  valid: boolean;
  reason?: string;
}
```

**验证规则**:
- ✅ `evidences.length > 0` - 必须有至少一条证据
- ✅ `evidences.length === plan.days.length` - 证据数量必须与计划天数匹配
- ✅ 不能有 `HARD` 违规 - 存在硬约束违反时，计划不能 finalize

### 2. PhysicalRealityModel 验证

```typescript
// 验证 PhysicalRealityModel 是否完整
validatePhysicalRealityModel(model: PhysicalRealityModel): {
  valid: boolean;
  missingFields: string[];
}
```

**验证规则**:
- ✅ `model.demEvidence` 必须存在
- ✅ `model.demEvidence.length > 0` - 不能为空数组

### 3. Abu 策略验证

Abu 策略会检查 DEM Evidence：

```typescript
// 检查 DEM Evidence 是否存在（缺失 = REJECT）
if (!physical.demEvidence || physical.demEvidence.length === 0) {
  return REJECT;
}
```

**注意**: Abu 会跳过占位符 demEvidence（`segmentId` 包含 `'placeholder'`）

## 字段详细说明

### 必需字段

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `segmentId` | `string` | 路段唯一标识符 | `"segment_day1_route1"` |
| `elevationProfile` | `number[]` | 海拔剖面数组（米） | `[100, 150, 200, 180]` |
| `cumulativeAscent` | `number` | 累计爬升（米） | `1200` |
| `maxSlopePct` | `number` | 最大坡度（百分比） | `25.5` |
| `rollingAscent3Days` | `number` | 3天滚动窗口累计爬升（米） | `3000` |
| `fatigueIndex` | `number` | 疲劳指数（0-100） | `45` |
| `violation` | `'HARD' \| 'SOFT' \| 'NONE'` | 违规类型 | `'NONE'` |
| `explanation` | `string` | 解释说明 | `"路段累计爬升1200m，在人体能力范围内"` |

### 可选字段（metadata）

| 字段 | 类型 | 说明 |
|------|------|------|
| `consecutiveHighAltitudeDays` | `number` | 连续高海拔天数 |
| `avgSlopePct` | `number` | 平均坡度（百分比） |
| `distanceM` | `number` | 距离（米） |
| `elevationRange` | `{ min: number; max: number }` | 海拔变化范围 |
| `criticalBreakpoints` | `Array<{...}>` | 关键断点（过陡段等） |

## 违规类型说明

### HARD（硬约束违反）

**定义**: 违反人体能力硬约束，计划必须修复后才能 finalize。

**示例**:
- 单日累计爬升超过 `maxDailyAscentM`
- 最大坡度超过 `maxSlopePct`
- 连续3天滚动爬升超过 `rollingAscent3DaysM`

**处理**: 
- Abu 策略会 REJECT
- Neptune 不允许修复没有 DEM evidence 的 segment
- 计划不能 finalize

### SOFT（软约束违反）

**定义**: 违反软约束，可以优化但不强制修复。

**示例**:
- 疲劳指数较高但未超过阈值
- 平均坡度略高但可接受

**处理**:
- 可以 finalize
- 建议优化

### NONE（无违规）

**定义**: 符合所有约束条件。

## 生成 DEM 证据

### 方法 1: 通过 DemDecisionEvidenceService

```typescript
const demEvidenceService = new DemDecisionEvidenceService();

// 为计划生成证据管道
const evidenceResult = await demEvidenceService.generateEvidencePipeline(
  plan,
  worldModelContext
);

// 验证证据
const validation = demEvidenceService.validatePlanHasEvidence(
  plan,
  evidenceResult.segmentEvidences
);
```

### 方法 2: 通过 DEM API

```bash
# 获取路线高程剖面
POST /api/dem/profile
{
  "polyline": [
    { "lat": 64.5, "lng": -18.5 },
    { "lat": 64.6, "lng": -18.4 }
  ],
  "samples": 100,
  "activityType": "walking"
}
```

### 方法 3: 手动构建（仅用于测试）

```typescript
const demEvidence: DemDecisionEvidence = {
  segmentId: 'segment_day1',
  elevationProfile: [100, 150, 200, 180],
  cumulativeAscent: 1200,
  maxSlopePct: 25.5,
  rollingAscent3Days: 3000,
  fatigueIndex: 45,
  violation: 'NONE',
  explanation: '路段累计爬升1200m，在人体能力范围内',
  metadata: {
    distanceM: 15000,
    elevationRange: {
      min: 100,
      max: 200
    }
  }
};
```

## 占位符 DEM 证据

在计划生成阶段，如果还没有具体路线，可以使用占位符：

```typescript
const placeholderEvidence: DemDecisionEvidence = {
  segmentId: 'placeholder_no_plan_yet',
  elevationProfile: [],
  cumulativeAscent: 0,
  maxSlopePct: 0,
  rollingAscent3Days: 0,
  fatigueIndex: 0,
  violation: 'NONE',
  explanation: '占位符：计划生成阶段尚未有具体路线，DEM 证据将在计划生成后填充',
};
```

**注意**: 
- `segmentId` 包含 `'placeholder'` 用于识别占位符数据
- Abu 策略会跳过占位符 demEvidence
- **占位符不能用于 finalize 计划**

## 在世界模型中的使用

### PhysicalRealityModel

```typescript
const physicalReality: PhysicalRealityModel = {
  demEvidence: [
    // 每个路段一条证据
    {
      segmentId: 'segment_day1',
      elevationProfile: [...],
      cumulativeAscent: 1200,
      maxSlopePct: 25.5,
      rollingAscent3Days: 3000,
      fatigueIndex: 45,
      violation: 'NONE',
      explanation: '...',
    },
    // ... 更多路段证据
  ],
  roadStates: [...],
  hazardZones: [...],
  ferryStates: [...],
  countryCode: 'IS',
  month: 7,
};
```

### 验证流程

1. **构建阶段**: 生成 DEM 证据（或使用占位符）
2. **Abu 验证**: 检查是否有 DEM 证据，缺失则 REJECT
3. **Dr.Dre 调整**: 基于 DEM 证据调整节奏
4. **Neptune 优化**: 基于 DEM 证据优化体验
5. **Finalize 检查**: 验证 DEM 证据完整性，存在 HARD 违规则拒绝

## 常见问题

### Q1: 如果没有 DEM 数据怎么办？

**A**: 使用占位符，但计划不能 finalize。需要：
1. 集成 DEM 服务（如 OpenElevation API）
2. 从路线段计算高程剖面
3. 重新生成 DEM 证据

### Q2: DEM 证据数量必须等于计划天数吗？

**A**: 是的。每个计划天应该有一条对应的 DEM 证据。

### Q3: 可以跳过 DEM 证据验证吗？

**A**: 不可以。DEM 证据是强制性的，没有 DEM 证据的计划不能 finalize。

### Q4: HARD 违规可以忽略吗？

**A**: 不可以。Abu 不允许忽略 HARD violation，必须修复后才能 finalize。

### Q5: 如何计算疲劳指数？

**A**: 基于累计爬升和距离的简化公式：
```typescript
fatigueIndex = Math.min(100, (totalAscent / 1000) * 10 + (totalDistance / 1000) * 2);
```

## 相关文件

- `src/trips/decision/interfaces/dem-decision-evidence.interface.ts` - DEM 证据接口定义
- `src/trips/decision/services/dem-decision-evidence.service.ts` - DEM 证据服务
- `src/trips/decision/models/physical-reality.model.ts` - 物理现实模型（包含 DEM 证据）
- `src/trips/decision/services/dem-evidence-enforcer.service.ts` - DEM 证据强制执行器
- `src/trips/dem/services/dem-elevation.service.ts` - DEM 高程服务
- `src/trips/dem/services/dem-effort-metadata.service.ts` - DEM 体力元数据服务

## 总结

DEM 证据是**强制性的决策证据源**，要求：

1. ✅ **必须存在**: 没有 DEM 证据的计划不能 finalize
2. ✅ **数量匹配**: 证据数量必须等于计划天数
3. ✅ **无 HARD 违规**: 存在硬约束违反时，计划不能 finalize
4. ✅ **完整字段**: 所有必需字段必须提供
5. ✅ **有效 segmentId**: 必须关联到具体路段

**占位符**: 仅用于计划生成阶段，不能用于 finalize。
