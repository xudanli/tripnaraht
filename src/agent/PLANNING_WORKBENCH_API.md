# 规划工作台 API 文档

**版本**: v2.0.0  
**最后更新**: 2026-02-04

## 概述

规划工作台（Planning Workbench）是 TripNARA 的核心规划引擎，负责从用户需求生成完整的行程方案。本文档描述了所有可用的 API 接口。

## 新增功能（v2.0.0）

### ✅ DEM地形数据填充
- 自动填充 `segments` 的 `distanceKm`、`ascentM`、`slopePct`
- 添加地形元数据（海拔、复杂度、难度、体力评分）

### ✅ 地理特征查询
- 自动查询河流、山脉、道路、海岸线等地理特征
- 检测危险区域（雪崩、泥石流、洪水等）

### ✅ Compare功能
- 支持对比多个骨架方案
- 多维度评分（可执行性、成本、疲劳、体验密度、风险、自由度）

### ✅ Commit功能
- 支持提交选定的骨架方案
- 自动填充 DEM 和地理特征数据

### ✅ RAG语义搜索
- POI查询使用向量搜索进行语义匹配
- 智能降级机制（语义搜索失败时自动降级到关键词搜索）

### ✅ 决策追溯链
- 记录决策过程和排除原因
- 存储到 `planState.metadata.exclusionLog` 和 `planState.metadata.decisionTrace`

---

## API 端点

### 1. 执行规划工作台流程

**接口**: `POST /api/planning-workbench/execute`

**描述**: 规划工作台的主入口，支持生成、对比、提交、调整等操作。

#### 请求参数

```typescript
{
  context: {
    destination: {
      country?: string;      // 国家（如"冰岛"）
      city?: string;         // 城市（如"雷克雅未克"）
      region?: string;       // 区域
    };
    days: number;            // 行程天数（必需）
    travelMode?: 'self_drive' | 'public_transit' | 'walking' | 'mixed';
    mustDo?: string[];       // 必去地点/活动
    mustAvoid?: string[];    // 必避地点/活动
    constraints?: {
      budget?: {
        total?: number;
        currency?: string;
        categories?: {
          transportation?: number;
          accommodation?: number;
          food?: number;
          tickets?: number;
          experiences?: number;
          buffer?: number;
        };
      };
      fitness?: {
        level?: 'low' | 'medium' | 'high';
        maxDailyAscentM?: number;
        maxDailyDistanceKm?: number;
        restDayFrequency?: number;
      };
      time?: {
        startDate?: string;  // ISO日期
        endDate?: string;    // ISO日期
        availableHoursPerDay?: number;
      };
      accommodation?: {
        level?: 'budget' | 'mid' | 'luxury';
        type?: string[];
      };
      companions?: {
        count?: number;
        ages?: number[];
        specialNeeds?: string[];
      };
    };
  };
  tripId?: string;           // 行程ID（可选）
  userAction?: 'generate' | 'compare' | 'commit' | 'adjust';
  existingPlanState?: PlanState;  // 现有方案状态（可选）
  selectedOptionId?: string;      // 选定的方案ID（commit时使用）
  skeletonOptions?: PlanSkeletonSet;  // 骨架方案集（compare时使用）
}
```

#### 响应结构

```typescript
{
  success: boolean;
  data: {
    planState: PlanState;
    uiOutput: {
      skeletonOptions?: PlanSkeletonSet;  // 骨架方案集
      comparison?: OptionComparison;       // 对比结果（compare操作）
      personas?: {
        abu: { verdict: string; evidence: string[] };
        drdre: { verdict: string; evidence: string[] };
        neptune: { verdict: string; evidence: string[] };
        consolidatedDecision: {
          status: 'ALLOW' | 'NEED_CONFIRM' | 'REJECT';
          summary: string;
          nextSteps: string[];
        };
      };
      health?: {
        budget: 'healthy' | 'warning' | 'critical';
        pace: 'healthy' | 'warning' | 'critical';
        feasibility: 'healthy' | 'warning' | 'critical';
      };
      confirmations?: string[];  // 需要用户确认的事项
    };
  };
}
```

#### 请求示例

**生成方案**:
```bash
curl -X POST "http://localhost:3000/api/planning-workbench/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "context": {
      "destination": {
        "country": "冰岛"
      },
      "days": 5,
      "travelMode": "self_drive",
      "constraints": {
        "budget": {
          "total": 50000,
          "currency": "CNY"
        },
        "fitness": {
          "level": "medium"
        }
      }
    },
    "userAction": "generate"
  }'
```

**对比方案**:
```bash
curl -X POST "http://localhost:3000/api/planning-workbench/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "context": {
      "destination": { "country": "冰岛" },
      "days": 5
    },
    "userAction": "compare",
    "skeletonOptions": {
      "options": [...],  // 要对比的方案列表
      "recommendation": { "optionId": "balanced_1" }
    }
  }'
```

**提交方案**:
```bash
curl -X POST "http://localhost:3000/api/planning-workbench/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "context": {
      "destination": { "country": "冰岛" },
      "days": 5
    },
    "userAction": "commit",
    "selectedOptionId": "balanced_1",
    "tripId": "trip_123"
  }'
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "planState": {
      "plan_id": "plan_1707123456789",
      "plan_version": 1,
      "itinerary": {
        "tripId": "trip_123",
        "segments": [
          {
            "segmentId": "day_1_segment_1",
            "dayIndex": 0,
            "distanceKm": 120.5,
            "ascentM": 450,
            "slopePct": 8.5,
            "metadata": {
              "theme": "雷克雅未克-黄金圈",
              "day": 1,
              "elevation": {
                "max": 650,
                "min": 50,
                "avg": 300
              },
              "terrainComplexity": 0.6,
              "difficulty": "moderate",
              "geoFeatures": {
                "rivers": { "nearRiver": true },
                "mountains": { "mountainDensityScore": 0.7 },
                "roads": { "nearRoad": true }
              },
              "accommodation": { ... },
              "restaurants": [ ... ],
              "attractions": [ ... ]
            }
          }
        ]
      },
      "metadata": {
        "exclusionLog": [
          {
            "excludedOptionId": "compact_1",
            "excludedOptionName": "紧凑型",
            "reason": "推荐理由: 5天行程建议均衡型，平衡体验和疲劳",
            "evidence": [
              "紧凑型方案节奏较紧，可能不符合用户偏好",
              "已考虑预算约束"
            ],
            "timestamp": "2026-02-04T10:00:00.000Z"
          }
        ],
        "decisionTrace": {
          "skeletonSelection": {
            "timestamp": "2026-02-04T10:00:00.000Z",
            "totalOptions": 3,
            "selectedOptionId": "balanced_1",
            "recommendationReason": "5天行程建议均衡型，平衡体验和疲劳"
          }
        }
      }
    },
    "uiOutput": {
      "skeletonOptions": {
        "options": [
          {
            "id": "compact_1",
            "name": "紧凑型",
            "dayThemes": [ ... ],
            "pois": [ ... ]
          },
          {
            "id": "balanced_1",
            "name": "均衡型",
            "dayThemes": [ ... ],
            "pois": [ ... ]
          }
        ],
        "recommendation": {
          "optionId": "balanced_1",
          "reason": "5天行程建议均衡型，平衡体验和疲劳"
        }
      },
      "personas": {
        "abu": {
          "verdict": "ALLOW",
          "evidence": [ ... ]
        },
        "drdre": {
          "verdict": "ALLOW",
          "evidence": [ ... ]
        },
        "neptune": {
          "verdict": "ALLOW",
          "evidence": [ ... ]
        },
        "consolidatedDecision": {
          "status": "ALLOW",
          "summary": "方案通过三人格评审",
          "nextSteps": []
        }
      }
    }
  }
}
```

---

### 2. 获取规划状态

**接口**: `GET /api/planning-workbench/state/:planId`

**描述**: 根据 planId 获取当前的 PlanState。

#### 路径参数

- `planId` (string, 必需): 规划 ID

#### 响应示例

```json
{
  "success": true,
  "data": {
    "planState": { ... }
  }
}
```

---

### 3. 获取行程的规划工作台数据

**接口**: `GET /api/planning-workbench/trips/:tripId`

**描述**: 获取指定行程的当前方案和方案历史列表。

#### 路径参数

- `tripId` (string, 必需): 行程 ID

---

### 4. 获取行程的规划方案列表

**接口**: `GET /api/planning-workbench/trips/:tripId/plans`

**描述**: 获取指定行程的所有规划方案列表，支持状态筛选和分页。

#### 路径参数

- `tripId` (string, 必需): 行程 ID

#### 查询参数

- `status` (string, 可选): 筛选状态 (`DRAFT` | `PROPOSED` | `NEED_CONFIRM` | `LOCKED`)
- `limit` (number, 可选): 每页数量（默认 20）
- `offset` (number, 可选): 偏移量（默认 0）

---

### 5. 获取方案详情

**接口**: `GET /api/planning-workbench/plans/:planId`

**描述**: 获取指定方案的详细信息（包含完整的 planState 和 uiOutput）。

#### 路径参数

- `planId` (string, 必需): 方案 ID

---

### 6. 对比多个规划方案

**接口**: `POST /api/planning-workbench/plans/compare`

**描述**: 对比多个规划方案，提供详细的对比结果。

#### 请求参数

```typescript
{
  planIds: string[];         // 要对比的方案 ID 列表（至少 2 个）
  compareFields?: string[]; // 要对比的字段（可选）
}
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "plans": [ ... ],
    "differences": [
      {
        "field": "budget.total",
        "plan1Value": 45000,
        "plan2Value": 50000,
        "impact": "medium",
        "description": "预算差异: 5000"
      }
    ],
    "summary": {
      "bestBudget": "plan_1",
      "recommendations": [ ... ]
    }
  }
}
```

---

### 7. 调整规划方案

**接口**: `POST /api/planning-workbench/plans/:planId/adjust`

**描述**: 基于现有方案进行调整，提供更细粒度的调整控制。

#### 路径参数

- `planId` (string, 必需): 方案 ID

#### 请求参数

```typescript
{
  adjustments: Array<{
    type: 'add_place' | 'remove_place' | 'modify_constraint' | 'change_day' | 'modify_budget';
    data: any;
  }>;
  regenerate?: boolean;  // 是否重新生成方案（默认 true）
}
```

---

### 8. 提交规划方案

**接口**: `POST /api/planning-workbench/plans/:planId/commit`

**描述**: 将规划方案提交并保存到行程，支持部分提交。

#### 路径参数

- `planId` (string, 必需): 规划 ID

#### 请求参数

```typescript
{
  tripId: string;  // 行程 ID（必需）
  options?: {
    partialCommit?: boolean;      // 是否部分提交
    commitDays?: number[];        // 要提交的天数（如果部分提交）
  };
}
```

---

## 数据结构

### PlanState

```typescript
interface PlanState {
  plan_id: string;
  plan_version: number;
  constraints: PlanConstraints;
  itinerary: {
    tripId: string;
    routeDirectionId: string;
    segments: RouteSegment[];
  };
  mobility: {
    transferSegments: TransferSegment[];
  };
  budget: {
    breakdown?: BudgetBreakdown;
    overrun?: OverrunDetection;
  };
  pace: {
    timeWindows?: TimeWindow[];
    fatigueScore?: FatigueScore;
    restPoints?: number[];
  };
  gate: GateStatus;
  evidence_refs: EvidenceEnvelope[];
  decision_log_refs: DecisionLogRef[];
  status: 'DRAFT' | 'PROPOSED' | 'NEED_CONFIRM' | 'LOCKED';
  world?: WorldModelContext;
  metadata?: {
    exclusionLog?: Array<{
      excludedOptionId: string;
      excludedOptionName: string;
      reason: string;
      evidence: string[];
      timestamp: string;
    }>;
    decisionTrace?: {
      skeletonSelection?: {
        timestamp: string;
        totalOptions: number;
        selectedOptionId: string;
        recommendationReason?: string;
      };
    };
    selectedSkeleton?: string;
    selectedSkeletonName?: string;
    committedAt?: string;
  };
}
```

### RouteSegment

```typescript
interface RouteSegment {
  segmentId: string;
  dayIndex: number;
  distanceKm: number;      // ✅ 已填充（DEM数据）
  ascentM: number;         // ✅ 已填充（DEM数据）
  slopePct: number;         // ✅ 已填充（DEM数据）
  metadata?: {
    theme: string;
    description: string;
    day: number;
    skeletonId: string;
    skeletonName: string;
    // ✅ DEM地形数据
    elevation?: {
      max: number;
      min: number;
      avg: number;
    };
    terrainComplexity?: number;
    difficulty?: 'easy' | 'moderate' | 'hard' | 'extreme';
    effortScore?: number;
    // ✅ 地理特征
    geoFeatures?: {
      rivers: {
        nearRiver: boolean;
        riverDensityScore: number;
      };
      mountains: {
        mountainDensityScore: number;
      };
      roads: {
        nearRoad: boolean;
        roadDensityScore: number;
      };
      coastlines: {
        nearCoastline: boolean;
      };
      accessibility: {
        hasPort: boolean;
        hasAirport: boolean;
      };
    };
    // ✅ 危险区域
    hazards?: Array<{
      zoneId: string;
      type: 'AVALANCHE' | 'MUDSLIDE' | 'FLOOD' | 'ICE' | 'VOLCANIC' | 'OTHER';
      level: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
      location?: { lat: number; lng: number };
      description?: string;
    }>;
    riskAssessment?: {
      hasHighRisk: boolean;
      hasMediumRisk: boolean;
      totalHazards: number;
    };
    // POI信息
    accommodation?: SkeletonPoi;
    restaurants?: Array<{
      meal: 'breakfast' | 'lunch' | 'dinner';
      poi: SkeletonPoi;
    }>;
    attractions?: SkeletonPoi[];
  };
}
```

### OptionComparison

```typescript
interface OptionComparison {
  options: Array<{
    optionId: string;
    scores: {
      executability: number;      // 0-100
      cost: number;              // 0-100 (越低越好)
      fatigue: number;           // 0-100 (越低越好)
      experienceDensity: number; // 0-100
      risk: number;              // 0-100 (越低越好)
      freedom: number;            // 0-100
    };
    summary: string;
  }>;
  recommendation?: {
    optionId: string;
    reason: string;
  };
}
```

---

## 错误码

| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `BAD_REQUEST` | 400 | 请求参数错误 |

---

## 注意事项

1. **DEM数据填充**: 在 `generate` 和 `commit` 操作后，会自动填充 `segments` 的 DEM 地形数据。如果 POI 坐标缺失，DEM 数据可能无法填充。

2. **地理特征查询**: 地理特征查询使用缓存机制，相同区域的查询结果会被缓存。

3. **语义搜索降级**: 如果 RAG 语义搜索失败，系统会自动降级到关键词搜索，确保 POI 查询的可靠性。

4. **决策追溯**: 所有决策过程都会记录到 `planState.metadata` 中，包括排除原因和决策日志引用。

5. **超时处理**: LLM 调用有超时保护（60-90秒），超时后会返回默认方案。

---

## 更新日志

### v2.0.0 (2026-02-04)
- ✅ 添加 DEM 地形数据填充
- ✅ 添加地理特征查询
- ✅ 实现 compare 功能
- ✅ 实现 commit 功能
- ✅ 集成 RAG 语义搜索
- ✅ 添加决策追溯链和排除过程记录
- ✅ 优化 Prompt，添加 Few-shot examples

### v1.0.0
- 初始版本
