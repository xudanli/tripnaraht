# TripNARA API Reference

> 前端对接文档 v2.0

## 概览

### 基础 URL

```
生产环境: https://api.tripnara.com
开发环境: http://localhost:3000
```

### 路由前缀

| 完整路径 | 说明 | 鉴权 |
|----------|------|------|
| `/api/v2/user/*` | 用户端 API | Bearer Token (用户) |
| `/api/v2/admin/*` | 管理端 API | Bearer Token (管理员) |

### ⚠️ 重要：URL 拼接说明

**完整请求 URL 示例：**
```
http://localhost:3000/api/v2/user/optimization/evaluate
```

**如果您的 HTTP 客户端已设置 baseURL：**

```typescript
// ❌ 错误：baseURL 包含 /api，路径又以 /api 开头
const client = axios.create({ baseURL: 'http://localhost:3000/api' });
client.post('/api/v2/user/optimization/evaluate'); // 变成 /api/api/v2/...

// ✅ 正确方式 1：baseURL 不包含 /api
const client = axios.create({ baseURL: 'http://localhost:3000' });
client.post('/api/v2/user/optimization/evaluate');

// ✅ 正确方式 2：baseURL 包含 /api，路径省略 /api
const client = axios.create({ baseURL: 'http://localhost:3000/api' });
client.post('/v2/user/optimization/evaluate');
```

### 通用响应格式

```typescript
// 成功响应
{
  "data": { ... },
  "success": true
}

// 错误响应
{
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述"
  },
  "success": false
}
```

### 相关接口文档

| 文档 | 说明 |
|------|------|
| [FITNESS_ASSESSMENT_API.md](./FITNESS_ASSESSMENT_API.md) | 体能评估 API（Phase 1）：问卷、画像、反馈、校准 `/api/v1/fitness` |
| [FITNESS_ANALYTICS_API.md](./FITNESS_ANALYTICS_API.md) | 体能数据分析 API（Phase 2）：趋势、异常、报告、A/B 测试、可穿戴 `/api/v1/fitness/analytics` |
| [FLYWHEEL_ADMIN_API.md](./FLYWHEEL_ADMIN_API.md) | 数据飞轮管理 API（Phase 2）：离线学习、用户数据量 `/api/v2/admin/flywheel` |
| [NEGOTIATION_UX_IMPROVEMENT_PROPOSAL.md](./NEGOTIATION_UX_IMPROVEMENT_PROPOSAL.md) | 协商结论界面展示优化提案（产品/架构评审） |
| [USER_PREFERENCES_API_DOCUMENTATION.md](../USER_PREFERENCES_API_DOCUMENTATION.md) | 用户偏好接口：UserTravelProfile、驾驶疲劳偏好等 |

---

## 用户端 API

### 1. 计划优化 (`/api/v2/user/optimization`)

#### 1.1 评估计划得分

评估计划的 8 维度效用值。

```
POST /api/v2/user/optimization/evaluate
```

**请求体**

```typescript
{
  "plan": RoutePlanDraft,      // 必填 - 待评估的计划
  "world": WorldModelContext,  // 必填 - 世界模型上下文
  "weights"?: {                // 可选：自定义 8 维权重（与 ObjectiveFunctionWeights 一致）
    "safety": number,                  // 安全 (默认 0.25)
    "experienceDensity": number,       // 体验密度 (默认 0.20)
    "philosophyAlignment": number,    // 路线哲学匹配度 (默认 0.15)
    "timeSlack": number,               // 时间余量 (默认 0.10)
    "fatigueRisk": number,             // 疲劳风险 (默认 0.15)
    "weatherRisk": number,             // 天气风险 (默认 0.05)
    "budgetOverrun": number,           // 预算超支风险 (默认 0.05)
    "pacingVariance": number          // 节奏方差 (默认 0.05)
  }
}
```

**请求示例**

```json
{
  "plan": {
    "tripId": "trip-123",
    "routeDirectionId": "iceland-ring-road",
    "days": [
      {
        "dayNumber": 1,
        "date": "2026-02-15",
        "segments": [
          { "from": "Reykjavik", "to": "Vik", "distanceKm": 180 }
        ]
      }
    ],
    "metadata": { "totalDays": 7, "startDate": "2026-02-15", "endDate": "2026-02-21" }
  },
  "world": {
    "physical": {
      "weather": { "temperature": 5, "windSpeed": 10, "precipitation": 0.2 },
      "terrain": { "elevation": 100, "gradient": 5 },
      "hazards": []
    },
    "human": {
      "fitnessLevel": 0.7,
      "currentFatigue": 0.2,
      "maxDailyAscentM": 800,
      "riskTolerance": 0.5
    },
    "routeDirection": {
      "id": "iceland-ring-road",
      "philosophy": { "scenic": true },
      "constraints": { "maxDailyDrivingHours": 8 }
    }
  }
}
```

**响应**

```typescript
{
  "totalUtility": number,      // 总效用值 (0-1)
  "breakdown": {
    "safetyScore": number,           // 安全得分
    "experienceScore": number,       // 体验密度得分
    "philosophyScore": number,       // 哲学契合度
    "timeSlackScore": number,        // 时间余量得分
    "fatigueRiskPenalty": number,    // 疲劳风险惩罚
    "weatherRiskPenalty": number,    // 天气风险惩罚
    "budgetOverrunPenalty": number,  // 预算超支惩罚
    "pacingVariancePenalty": number  // 节奏方差惩罚
  },
  "weightsUsed": ObjectiveFunctionWeights,
  "evaluatedAt": string        // ISO 时间
}
```

---

#### 1.2 比较两个计划

```
POST /api/v2/user/optimization/compare
```

**请求体**

支持驼峰或蛇形字段名：`planA`/`plan_a`、`planB`/`plan_b`、`world`。

```typescript
{
  "planA": RoutePlanDraft,   // 或 plan_a
  "planB": RoutePlanDraft,   // 或 plan_b
  "world": WorldModelContext
}
```

**响应**

```typescript
{
  "preferredPlan": "A" | "B" | "EQUAL",
  "utilityDifference": number,  // A - B
  "dimensionComparison": {
    "safety": { "a": number, "b": number, "winner": string },
    "experience": { "a": number, "b": number, "winner": string },
    "philosophy": { "a": number, "b": number, "winner": string },
    "timeSlack": { "a": number, "b": number, "winner": string }
  }
}
```

---

#### 1.3 一键优化计划

执行完整优化流程：约束检查 → 排程优化 → 稳定性修复。

```
POST /api/v2/user/optimization/optimize
```

**请求体（二选一）**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| plan | RoutePlanDraft | 条件 | 与 `world` 同时传入时使用 |
| world | WorldModelContext | 条件 | 与 `plan` 同时传入时使用 |
| tripId / trip_id | string | 条件 | **仅在不传 plan+world 时使用**，后端根据行程 ID 加载 plan 与 world 再优化 |

- 方式一：传 `plan` + `world`。
- 方式二：只传 `tripId` 或 `trip_id`，后端加载该行程并构建 plan 与 world 再执行优化。
- 若既未传 plan+world 也未传 tripId/trip_id，返回 **400**。

```typescript
// 方式一
{ "plan": RoutePlanDraft, "world": WorldModelContext }

// 方式二
{ "tripId": "行程UUID" }   // 或 "trip_id"
```

**响应**

```typescript
{
  "originalPlan": RoutePlanDraft,
  "optimizedPlan": RoutePlanDraft,
  "changes": Array<{
    "type": "CONSTRAINT_FIX" | "SCHEDULE_OPT" | "STABILITY_FIX",
    "description": string,
    "impact": { "utilityDelta": number }
  }>,
  "finalUtility": number,
  "processingTimeMs": number
}
```

---

#### 1.4 风险评估

使用 Monte Carlo 模拟计算风险指标。

```
POST /api/v2/user/optimization/risk-assessment
```

**请求体（二选一）**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| plan | RoutePlanDraft | 条件 | 与 `world` 同时传入时使用 |
| world | WorldModelContext | 条件 | 与 `plan` 同时传入时使用 |
| tripId / trip_id / id | string | 条件 | **仅在不传 plan+world 时使用**，后端加载该行程的 plan 与 world |
| sampleSize | number | 否 | 蒙特卡洛采样数，默认 1000 |

- 方式一：传 `plan` + `world`（可选 `sampleSize`）。
- 方式二：只传 `tripId`、`trip_id` 或 `id`，后端加载 plan 与 world 再评估风险。
- 若既未传 plan+world 也未传 tripId/trip_id/id，返回 **400**。

```typescript
// 方式一
{ "plan": RoutePlanDraft, "world": WorldModelContext, "sampleSize"?: number }

// 方式二
{ "tripId": "行程UUID", "sampleSize"?: number }   // 或 "trip_id" / "id"
```

**请求示例**

```json
{
  "plan": {
    "tripId": "trip-123",
    "days": [
      {
        "date": "2026-02-15",
        "segments": [
          { "from": "Reykjavik", "to": "Vik", "distanceKm": 180 }
        ]
      }
    ]
  },
  "world": {
    "physical": {
      "weather": { "temperature": 5, "windSpeed": 10, "precipitation": 0.2 },
      "terrain": { "elevation": 100, "gradient": 5 },
      "hazards": []
    },
    "human": {
      "fitnessLevel": 0.7,
      "currentFatigue": 0.2,
      "maxDailyAscentM": 800,
      "riskTolerance": 0.5
    },
    "routeDirection": {
      "id": "iceland-ring-road",
      "philosophy": "scenic",
      "constraints": { "maxDailyDrivingHours": 8 }
    }
  },
  "sampleSize": 1000
}
```

**响应**

```typescript
{
  "expectedUtility": number,           // 期望效用
  "confidenceInterval": {
    "lower": number,                   // 95% CI 下界
    "upper": number                    // 95% CI 上界
  },
  "feasibilityProbability": number,    // 可行概率 P(feasible)
  "downsideRisk": number,              // P(U < threshold)
  "riskFactors": Array<{
    "factor": string,
    "impact": number,
    "probability": number
  }>,
  "recommendation": string
}
```

---

#### 1.5 获取协商结论

三守护者（Abu/Dre/Neptune）对计划的评估和协商结果。

```
POST /api/v2/user/optimization/negotiation
```

**请求体（二选一）**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| plan | RoutePlanDraft | 条件 | 与 `world` 同时传入时使用 |
| world | WorldModelContext | 条件 | 与 `plan` 同时传入时使用 |
| tripId / trip_id / id | string | 条件 | **仅在不传 plan+world 时使用**，后端加载该行程的 plan 与 world 再协商 |

- 方式一：传 `plan` + `world`。
- 方式二：只传 `tripId`、`trip_id` 或 `id`，后端加载 plan 与 world 再返回协商结论。
- 若既未传 plan+world 也未传 tripId/trip_id/id，返回 **400**。

```typescript
// 方式一
{ "plan": RoutePlanDraft, "world": WorldModelContext }

// 方式二
{ "tripId": "行程UUID" }   // 或 "trip_id" / "id"
```

**响应**

```typescript
{
  "decision": "APPROVE" | "APPROVE_WITH_CONDITIONS" | "REJECT" | "NEEDS_HUMAN",
  "consensusLevel": number,            // 共识度 (0-1)，前端 ×100 显示为百分比
  "keyTradeoffs": string[],            // 分歧所在，用户可读维度名（如 "安全与节奏存在分歧"）
  "conditions"?: string[],             // 附加条件（decision=APPROVE_WITH_CONDITIONS 时）
  "humanDecisionPoints"?: string[],    // 需人类决策的点（decision=NEEDS_HUMAN 时）
  "evaluationSummary": {
    "abuUtility": number,              // 安全守护者 Abu 评分 (0-1)，前端 ×100 显示
    "dreUtility": number,              // 节奏守护者 Dre 评分 (0-1)，前端 ×100 显示
    "neptuneUtility": number,          // 修复守护者 Neptune 评分 (0-1)，前端 ×100 显示
    "criticalConcerns": string[]       // 具体问题（分歧产生的原因）
  },
  "votingResult": {
    "approve": number,                 // 赞成票数，非负整数
    "reject": number,                  // 反对票数，非负整数
    "abstain": number                  // 弃权票数，非负整数
  },
  "fatiguePrediction"?: Array<{        // TDFPM 疲劳预测（按天），Phase 2 新增
    "dayIndex": number,
    "fatigueScore": number,            // 0-100，60+ 建议关注
    "riskLevel": "LOW" | "MODERATE" | "HIGH" | "DANGEROUS",
    "recommendation": "OK" | "REST_SOON" | "REST_NOW" | "SPLIT_DAY" | "STOP_DRIVING",
    "confidence"?: number              // 0-1，缺数据时较低
  }>
}
```

**字段与界面展示对应关系**

| 界面展示 | 接口字段 | 类型 | 前端处理 |
|----------|----------|------|----------|
| 附条件批准 / 批准 / 拒绝 / 需人类决策 | `decision` | `"APPROVE" \| "APPROVE_WITH_CONDITIONS" \| "REJECT" \| "NEEDS_HUMAN"` | 直接映射为「批准」「附条件批准」「拒绝」「需人工决策」 |
| 共识度 85% | `consensusLevel` | number (0–1) | `consensusLevel * 100` 显示为整数百分比 |
| 2 赞成 · 0 反对 · 1 弃权 | `votingResult.approve` / `reject` / `abstain` | number (非负整数) | 拼接为「X 赞成 · Y 反对 · Z 弃权」 |
| 安全守护者 64 · 节奏 44 · 修复 67 | `evaluationSummary.abuUtility` / `dreUtility` / `neptuneUtility` | number (0–1) | 各值 ×100 取整，对应 Abu/Dre/Neptune 的展示分数 |
| 可执行的调整 | `evaluationSummary.criticalConcerns` | string[] | 区块标题「可执行的调整」；与 conditions 去重 |
| 不同维度的评估意见 | `keyTradeoffs` | string[] | 区块标题「不同维度的评估意见」；弱化、可折叠；副标题：「安全、节奏、体验等角度看法不一，供参考」 |
| 行程优化建议 (N) | 无独立字段 | - | `criticalConcerns.length + keyTradeoffs.length`（去重后） |
| 出发前建议完成 | `conditions` | string[]（可选） | 区块标题「出发前建议完成」；`decision === "APPROVE_WITH_CONDITIONS"` 时展示；补充说明：「为保障行程安全与体验，建议在出发前完成以下调整。」；与 criticalConcerns 去重 |
| 需人类决策的点 | `humanDecisionPoints` | string[]（可选） | 仅在 `decision === "NEEDS_HUMAN"` 时展示 |
| 驾驶疲劳预测 | `fatiguePrediction` | Array（可选） | 按天的 TDFPM 疲劳分数与建议；用于行程页疲劳卡片或休息提醒 |

**专家团队参考：字段语义与数据来源**

| 字段 | 语义 | 数据来源 | 示例值 |
|------|------|----------|--------|
| `evaluationSummary.criticalConcerns` | **具体问题（分歧产生的原因）**：各守护者识别出的可执行风险与改进建议，用户可直接据此调整计划 | 合并自 `primaryConcerns`（维度级 + 按天细化）+ `suggestedAdjustments`，去重 | `["天气存在不确定性，建议调整停留顺序或预留备选方案", "建议处理软约束以降低风险"]` |
| `keyTradeoffs` | **分歧所在**：哪些评估维度（安全/节奏/修复）之间判断不一致，对应 Abu(安全)/Dre(节奏)/Neptune(修复) 的立场差异 | 辩论轮次中提取的支持 vs 反对方，映射为用户可读维度名 | `["安全与节奏存在分歧"]`、`["安全与修复存在分歧"]` |
| `conditions` | **附加条件**：若为附条件批准，需满足的调整建议 | 各守护者投「有条件通过」时提交的 `suggestedAdjustments` | `["建议拆分高负荷天或插入休息日"]` |
| `humanDecisionPoints` | **需人类决策的点**：需人工介入的争议点 | 决策为 `NEEDS_HUMAN` 时，从持异议守护者的 `primaryConcerns` 提取 | `["ABU: 存在显著天气风险; DRE: 节奏不均衡"]` |
| `fatiguePrediction` | **驾驶疲劳预测**：TDFPM 按天疲劳分数与风险等级 | 基于驾驶时长、路况、天气、睡眠/休息估算；60+ 为疲劳，80+ 为危险 | 见 [TDFPM_INTEGRATION_ASSESSMENT.md](./TDFPM_INTEGRATION_ASSESSMENT.md) |

> **区分说明**：`criticalConcerns` 侧重「具体问题与可执行建议」，`keyTradeoffs` 侧重「哪些维度/角色有不同判断」。二者互补，共同支撑「主要分歧」的完整展示。

> **UX 优化**：用户反馈「看不懂」时，可参考 [NEGOTIATION_UX_IMPROVEMENT_PROPOSAL.md](./NEGOTIATION_UX_IMPROVEMENT_PROPOSAL.md)，供产品经理与架构师评审方案。

---
#### 1.6 提交反馈

记录用户对行程的满意度反馈。

```
POST /api/v2/user/optimization/feedback
```

**请求体**

```typescript
{
  "userId": string,
  "tripId": string,
  "type": "SATISFACTION_RATING" | "FATIGUE_REPORT" | "PLAN_MODIFICATION" | 
          "PREFERENCE_UPDATE" | "TRIP_COMPLETION" | "EARLY_TERMINATION",
  "data": {
    // 满意度评分 (1-5)
    "overallSatisfaction"?: number,
    "safetyPerception"?: number,
    "experienceQuality"?: number,
    "pacingComfort"?: number,
    "philosophyMatch"?: number,
    
    // 疲劳数据 (0-2)
    "actualFatigueLevel"?: number,
    "predictedFatigueLevel"?: number,
    
    // 修改数据
    "modificationType"?: "SPLIT_DAY" | "INSERT_REST" | "REMOVE_ACTIVITY" | "REORDER" | "OTHER",
    "modificationReason"?: string,
    
    // 完成数据
    "completionRate"?: number,
    "daysCompleted"?: number,
    "totalDays"?: number
  }
}
```

**响应**

```typescript
{
  "success": true,
  "feedbackId": string
}
```

---

#### 1.7 获取个性化偏好

```
GET /api/v2/user/optimization/preferences/:userId
```

**响应**

```typescript
{
  "weights": ObjectiveFunctionWeights,
  "confidence": number,       // 学习置信度 (0-1)
  "lastUpdated": string       // ISO 时间
}
```

---

#### 1.8 接口需求清单（前端展示所需）

以下为前端展示所需字段的汇总与约束，后端已保证返回有效数值（避免 NaN）及非负整数投票数。

| 接口 | 路径 | 需提供的字段 | 用途 |
|------|------|--------------|------|
| **协商结论** | `POST /api/v2/user/optimization/negotiation` | `evaluationSummary.criticalConcerns` | **必填**，用于展示「具体问题（分歧产生的原因）」 |
| 同上 | 同上 | `keyTradeoffs` | 展示「分歧所在（哪些评估维度有不同判断）」 |
| 同上 | 同上 | `votingResult.approve/reject/abstain` | 赞成/反对/弃权（非负整数） |
| 同上 | 同上 | `evaluationSummary.abuUtility/dreUtility/neptuneUtility` | 安全/节奏/修复 维度评分 |
| 同上 | 同上 | `consensusLevel`, `decision` | 共识度、决策结论 |
| **风险评估** | `POST /api/v2/user/optimization/risk-assessment` | `downsideRisk`, `expectedUtility`, `feasibilityProbability`, `confidenceInterval` | 有效数值（NaN 已防护） |
| **评估计划** | `POST /api/v2/user/optimization/evaluate` | `weightsUsed` | 各维度权重，用于展示「权重 X%」；缺省时前端用默认值 |
| **优化计划** | `POST /api/v2/user/optimization/optimize` | `summary.finalUtility`, `logs`, `plan` | `finalUtility` 已防 NaN；`logs` 为空时前端可展示「当前计划已较优」；`plan` 即优化后计划 |

**协商结论**：完整字段与界面映射见上文「1.5 获取协商结论」的「字段与界面展示对应关系」表。若 `criticalConcerns` 为空，用户只能看到抽象描述；可按天/时段细化需在 `GuardianDebateService` 中扩展。

**优化接口响应映射**：`optimizedPlan` = 响应体中的 `plan`；`changes` = 响应体中的 `logs`；`finalUtility` = 响应体中的 `summary.finalUtility`。

---

### 2. 团队协同 (`/api/v2/user/team`)

#### 2.1 创建团队

```
POST /api/v2/user/team
```

**请求体**

```typescript
{
  "name": string,
  "type": "FAMILY" | "FRIENDS" | "EXPEDITION" | "TOUR_GROUP" | "CUSTOM",
  "decisionWeightMode": "EQUAL" | "LEADER_DOMINANT" | "EXPERIENCE_WEIGHTED" | "FITNESS_WEIGHTED" | "CUSTOM",
  "members": Array<{
    "userId": string,
    "displayName": string,
    "role": "LEADER" | "MEMBER" | "OBSERVER",
    "decisionWeight": number,           // 0-1
    "fitnessLevel": "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT",
    "experienceLevel": "NOVICE" | "SOME_EXPERIENCE" | "EXPERIENCED" | "EXPERT",
    "personalWeights": ObjectiveFunctionWeights,
    "specialConstraints"?: {
      "maxDailyAscentM"?: number,
      "maxDailyHours"?: number,
      "altitudeLimit"?: number,
      "restFrequency"?: "LOW" | "MEDIUM" | "HIGH",
      "specialNeeds"?: string[]
    }
  }>,
  "teamConstraints"?: {
    "useWeakestLink": boolean,          // 是否使用最弱链
    "maxAcceptableDisagreement": number,
    "unanimityRequired": string[]       // 需全票通过的决策
  }
}
```

**响应**

```typescript
{
  "teamId": string,
  "name": string,
  "type": string,
  "members": TeamMember[],
  "createdAt": string
}
```

---

#### 2.2 获取团队信息

```
GET /api/v2/user/team/:teamId
```

---

#### 2.3 添加成员

```
POST /api/v2/user/team/:teamId/members
```

**请求体**：同创建时的成员格式

---

#### 2.4 移除成员

```
DELETE /api/v2/user/team/:teamId/members/:userId
```

---

#### 2.5 团队协商

```
POST /api/v2/user/team/:teamId/negotiate
Content-Type: application/json
Authorization: Bearer <token>
```

**请求体（二选一）**

- **方式一：传 plan + world**（与计划优化评估接口一致）
- **方式二：只传 tripId**：后端根据 `tripId` 加载行程，自动构建 `plan` 与 `world` 再协商（适合前端已有行程 ID、未预先拉取世界模型的场景）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| plan | RoutePlanDraft | 条件 | 待协商的计划；与 `world` 同时传入时使用，需包含 `tripId`、`routeDirectionId`、`segments` |
| world | WorldModelContext | 条件 | 世界模型上下文；与 `plan` 同时传入时使用 |
| tripId | string | 条件 | 行程 ID；**仅在不传 plan/world 时使用**，后端将加载该行程并构建 plan 与 world 再协商 |

- 若既未传 `plan`+`world` 也未传 `tripId`：返回 **400**，提示缺少 plan 或仅传 tripId。
- 若只传 `tripId` 但行程不存在：返回 **400**，`无法根据 tripId 加载行程：行程 <id> 不存在`。
- 传了 `plan` + `world` 时优先使用，不会按 `tripId` 加载。

**请求体示例（方式一：plan + world）**

```typescript
{
  "plan": {
    "tripId": "uuid-of-trip",
    "routeDirectionId": "uuid-of-route-direction",
    "segments": [
      { "segmentId": "s1", "dayIndex": 1, "distanceKm": 50, "ascentM": 400, "slopePct": 5 }
    ]
  },
  "world": {
    "physical": { /* PhysicalRealityModel */ },
    "human": { /* HumanCapabilityModel */ },
    "routeDirection": { /* RouteDirectionWithPhilosophy */ }
  }
}
```

**请求体示例（方式二：仅 tripId）**

```json
{
  "tripId": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1"
}
```

**响应**

```typescript
{
  "decision": string,
  "consensusLevel": number,
  "memberEvaluations": Array<{
    "userId": string,
    "displayName": string,
    "utility": number,
    "concerns": string[]
  }>,
  "conflicts": Array<{
    "type": string,
    "members": string[],
    "description": string,
    "suggestedResolution"?: string
  }>,
  "teamConstraintsSatisfied": boolean
}
```

---

#### 2.6 获取团队综合权重

```
GET /api/v2/user/team/:teamId/weights
```

**响应**

```typescript
{
  "weights": ObjectiveFunctionWeights,
  "memberContributions": Array<{
    "userId": string,
    "displayName": string,
    "contributionWeight": number
  }>
}
```

---

#### 2.7 获取团队约束（最弱链）

```
GET /api/v2/user/team/:teamId/constraints
```

**响应**

```typescript
{
  "constraints": {
    "maxDailyAscentM"?: number,
    "maxDailyHours"?: number,
    "altitudeLimit"?: number,
    "restFrequency"?: string,
    "specialNeeds"?: string[]
  },
  "constraintSources": Array<{
    "constraint": string,
    "sourceUserId": string,
    "sourceDisplayName": string
  }>
}
```

---

### 3. 实时状态 (`/api/v2/user/realtime`)

> **重要**：在查询实时状态之前，需要先初始化行程的实时状态。

#### 3.1 初始化行程实时状态

为行程初始化实时状态监控。系统会根据提供的基本参数自动生成完整的概率模型。

```
POST /api/v2/user/realtime/state/initialize
```

**请求体**

```typescript
{
  "tripId": string,           // 必填 - 行程 ID
  "weather"?: {               // 可选 - 初始天气参数
    "temperatureC"?: number,         // 温度 (°C)，默认 15
    "windSpeedMs"?: number,          // 风速 (m/s)，默认 5
    "precipitationProbability"?: number  // 降水概率 (0-1)，默认 0.2
  },
  "human"?: {                 // 可选 - 初始人体状态
    "fatigueLevel"?: number,         // 疲劳等级 (0-1)，默认 0.3
    "altitudeAdaptation"?: number    // 海拔适应度 (0-1)，默认 0.7
  },
  "roads"?: Array<{           // 可选 - 路段状态
    "roadId": string,
    "status": "OPEN" | "RESTRICTED" | "CLOSED",
    "accessProbability"?: number     // 通行概率 (0-1)，默认 0.9
  }>
}
```

**请求示例**

```json
{
  "tripId": "4c5e82bb-8337-48ad-9099-39aea613a311",
  "weather": {
    "temperatureC": 10,
    "windSpeedMs": 8,
    "precipitationProbability": 0.3
  },
  "human": {
    "fatigueLevel": 0.2
  }
}
```

**响应**

```typescript
{
  "success": boolean,
  "tripId": string,
  "initializedAt": string,
  "summary": {
    "weatherReady": boolean,
    "humanStateReady": boolean,
    "roadsCount": number
  }
}
```

---

#### 3.2 检查状态是否存在

检查行程的实时状态是否已初始化，用于前端判断是否需要调用初始化接口。

```
GET /api/v2/user/realtime/state/:tripId/exists
```

**响应**

```typescript
{
  "exists": boolean,
  "tripId": string
}
```

**前端处理逻辑建议**

```typescript
// 方式一（推荐）：使用 autoInit 参数自动初始化
async function getRealtimeState(tripId: string) {
  try {
    // 直接请求，系统自动处理初始化
    const response = await fetch(`/api/v2/user/realtime/state/${tripId}?autoInit=true`);
    return await response.json();
  } catch (error) {
    console.error('获取实时状态失败', error);
    return null;
  }
}

// 方式二：手动检查并初始化（适合需要自定义初始化参数的场景）
async function getRealtimeStateManual(tripId: string) {
  try {
    // 1. 先检查状态是否存在
    const checkRes = await fetch(`/api/v2/user/realtime/state/${tripId}/exists`);
    const { exists } = await checkRes.json();
    
    if (!exists) {
      // 2. 如果不存在，使用自定义参数初始化
      await fetch('/api/v2/user/realtime/state/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          tripId,
          weather: { temperatureC: 10 },  // 自定义初始值
          human: { fatigueLevel: 0.2 }
        })
      });
    }
    
    // 3. 获取状态
    const stateRes = await fetch(`/api/v2/user/realtime/state/${tripId}`);
    return await stateRes.json();
  } catch (error) {
    console.error('获取实时状态失败', error);
    return null;
  }
}
```

---

#### 3.3 订阅状态更新

```
POST /api/v2/user/realtime/subscribe
```

**请求体**

```typescript
{
  "tripId": string,
  "userId": string,
  "eventTypes": Array<"WEATHER_CHANGE" | "ROAD_STATUS_CHANGE" | "HAZARD_DETECTED" | 
                      "HUMAN_STATE_CHANGE" | "FEASIBILITY_CHANGE">,
  "minSeverity": "INFO" | "WARNING" | "CRITICAL",
  "updateIntervalSeconds": number,
  "includePredictions"?: boolean
}
```

**响应**

```typescript
{
  "subscriptionId": string,
  "nextUpdateAt": string
}
```

---

#### 3.4 取消订阅

```
DELETE /api/v2/user/realtime/subscribe/:subscriptionId
```

---

#### 3.5 获取当前状态

```
GET /api/v2/user/realtime/state/:tripId
GET /api/v2/user/realtime/state/:tripId?autoInit=true
```

**查询参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `autoInit` | boolean | 否 | 状态不存在时是否自动初始化（默认 `false`）|

> **推荐**：使用 `?autoInit=true` 参数可以简化前端逻辑，系统会自动为未初始化的行程创建默认状态。

**响应**

```typescript
{
  "tripId": string,
  "updatedAt": string,
  "weather": {
    "temperatureC": number,
    "windSpeedMs": number,
    "precipitationProbability": number,
    "visibility": "EXCELLENT" | "GOOD" | "MODERATE" | "POOR" | "VERY_POOR",
    "alerts": string[]
  },
  "roads": Array<{
    "segmentId": string,
    "status": "OPEN" | "RESTRICTED" | "CLOSED",
    "accessProbability": number,
    "warning"?: string
  }>,
  "human": {
    "fatigueLevel": number,           // 0-1
    "altitudeSicknessRisk": number,   // 0-1
    "recommendations": string[]
  }
}
```

**简化的前端调用示例**

```typescript
// 推荐方式：使用 autoInit 自动初始化
async function getRealtimeState(tripId: string) {
  const response = await fetch(`/api/v2/user/realtime/state/${tripId}?autoInit=true`);
  return await response.json();
}
```

---

#### 3.6 预测未来状态

```
GET /api/v2/user/realtime/state/:tripId/predict?hoursAhead=24
GET /api/v2/user/realtime/state/:tripId/predict?hoursAhead=24&autoInit=true
```

**查询参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `hoursAhead` | number | 是 | 预测未来小时数 |
| `autoInit` | boolean | 否 | 状态不存在时是否自动初始化（默认 `false`）|

**响应**

```typescript
{
  "predictedAt": string,
  "hoursAhead": number,
  "weather": {
    "temperatureC": { "mean": number, "stdDev": number },
    "windSpeedMs": { "mean": number, "stdDev": number },
    "precipitationProbability": number
  },
  "feasibility": {
    "probability": number,
    "riskFactors": string[]
  },
  "confidence": number
}
```

---

#### 3.7 提交实地报告

用户报告实地观察到的情况。

```
POST /api/v2/user/realtime/report
```

**请求体**

```typescript
{
  "type": "WEATHER" | "ROAD_STATUS" | "HAZARD" | "HUMAN_STATE",
  "location"?: {
    "lat": number,
    "lng": number,
    "segmentId"?: string
  },
  "data": {
    // WEATHER
    "condition"?: string,
    "windStrong"?: boolean,
    "visibility"?: string,
    
    // ROAD_STATUS
    "roadCondition"?: string,
    "obstacle"?: string,
    
    // HAZARD
    "hazardType"?: string,
    "severity"?: string,
    
    // HUMAN_STATE
    "feeling"?: string,
    "symptoms"?: string[]
  },
  "confidence": number   // 0-1
}
```

**响应**

```typescript
{
  "reportId": string,
  "thanksMessage": string
}
```

---


## 管理端 API

> **注意**: 带有 🔓 标记的接口是公开的，无需认证即可访问

### 1. 系统管理 (`/api/v2/admin/optimization`)

#### 1.1 获取系统统计 🔓

```
GET /api/v2/admin/optimization/stats
```

**响应**

```typescript
{
  "persistence": {
    "totalUsers": number,
    "totalFeedback": number,
    "totalLearningRuns": number,
    "avgFeedbackPerUser": number
  },
  "currentWeights": ObjectiveFunctionWeights,
  "health": {
    "status": "healthy" | "degraded" | "unhealthy",
    "lastCheck": string
  }
}
```

---

#### 1.2 健康检查 🔓

```
GET /api/v2/admin/optimization/health
```

---

#### 1.3 批量权重学习

```
POST /api/v2/admin/optimization/learn/batch
```

**请求体**

```typescript
{
  "userIds"?: string[],        // 为空则学习所有用户
  "minFeedbackCount"?: number, // 最小反馈数阈值 (默认 10)
  "configOverrides"?: {
    "learningRate"?: number,
    "minSamples"?: number
  }
}
```

---

#### 1.4 获取学习历史

```
GET /api/v2/admin/optimization/learning-history/:userId
```

---

#### 1.5 获取默认权重 🔓

```
GET /api/v2/admin/optimization/default-weights
```

**响应**

```typescript
{
  "weights": ObjectiveFunctionWeights,  // 当前默认权重
  "lastUpdated": string                 // 最后更新时间
}
```

---

#### 1.6 更新默认权重

```
POST /api/v2/admin/optimization/default-weights
```

**请求体**

```typescript
{
  "weights": ObjectiveFunctionWeights,
  "reason": string,
  "operatorId": string
}
```

---

### 2. 数据导入 (`/api/v2/admin/realtime`)

#### 2.1 批量导入观测数据

```
POST /api/v2/admin/realtime/observations/batch
```

**请求体**

```typescript
{
  "source": "WEATHER_API" | "ROAD_AUTHORITY" | "SENSOR" | "PREDICTION" | "CROWD_SOURCE",
  "observations": Array<{
    "type": "WEATHER" | "ROAD_STATUS" | "HAZARD" | "TRANSPORT",
    "location"?: {
      "lat": number,
      "lng": number,
      "segmentId"?: string,
      "regionId"?: string
    },
    "data": Record<string, any>,
    "confidence": number,
    "validityHours": number
  }>
}
```

---

### 3. A/B 测试 (`/api/v2/admin/experiments`)

#### 3.1 创建实验

```
POST /api/v2/admin/experiments
```

**请求体**

```typescript
{
  "name": string,
  "description": string,
  "hypothesis": string,
  "variants": Array<{
    "variantId": string,
    "name": string,
    "description": string,
    "isControl": boolean,
    "trafficAllocation": number,
    "weights": ObjectiveFunctionWeights,
    "config"?: Record<string, any>
  }>,
  "metrics": Array<{
    "metricId": string,
    "name": string,
    "type": "CONTINUOUS" | "BINARY" | "COUNT" | "RATIO",
    "isPrimary": boolean,
    "direction": "HIGHER_IS_BETTER" | "LOWER_IS_BETTER",
    "minimumDetectableEffect": number,
    "calculation": string
  }>,
  "allocationStrategy": "RANDOM" | "HASH_BASED" | "STRATIFIED" | "MULTI_ARMED_BANDIT",
  "targetSampleSize": number,
  "significanceLevel"?: number,
  "statisticalPower"?: number,
  "plannedStartDate": string,
  "plannedEndDate": string,
  "enableEarlyStopping"?: boolean,
  "earlyStoppingThreshold"?: number,
  "userFilter"?: {
    "countries"?: string[],
    "fitnessLevels"?: string[],
    "experienceLevels"?: string[],
    "minTrips"?: number
  },
  "createdBy": string
}
```

---

#### 3.2 获取实验列表

```
GET /api/v2/admin/experiments?status=RUNNING
```

---

#### 3.3 启动/暂停/停止实验

```
PATCH /api/v2/admin/experiments/:experimentId/start
PATCH /api/v2/admin/experiments/:experimentId/pause
PATCH /api/v2/admin/experiments/:experimentId/stop
```

---

#### 3.4 获取实验分析

```
GET /api/v2/admin/experiments/:experimentId/analysis
```

**响应**

```typescript
{
  "experimentId": string,
  "status": string,
  "progress": {
    "currentSampleSize": number,
    "targetSampleSize": number,
    "percentComplete": number
  },
  "variantStatistics": Array<{
    "variantId": string,
    "sampleSize": number,
    "metrics": Record<string, {
      "mean": number,
      "stdDev": number,
      "min": number,
      "max": number,
      "percentile95": number
    }>
  }>,
  "testResults": Record<string, Array<{
    "control": string,
    "treatment": string,
    "result": {
      "pValue": number,
      "isSignificant": boolean,
      "relativeUplift": number,
      "confidenceInterval": { "lower": number, "upper": number }
    }
  }>>,
  "recommendation": string,
  "winningVariant"?: string
}
```

---

### 4. 公理验证 (`/api/v2/admin/axioms`)

#### 4.1 获取验证报告 🔓

```
GET /api/v2/admin/axioms/report
```

---

#### 4.2 公理健康检查 🔓

```
GET /api/v2/admin/axioms/health
```

**响应**

```typescript
{
  "status": "healthy" | "degraded" | "unhealthy",
  "activeViolations": number,
  "axiomStatus": {
    "AXIOM_1_NORMALIZATION": { "passed": boolean, "message"?: string },
    "AXIOM_2_HIERARCHY": { "passed": boolean, "message"?: string },
    "AXIOM_3_FEASIBILITY": { "passed": boolean, "message"?: string },
    "AXIOM_4_UNCERTAINTY": { "passed": boolean, "message"?: string },
    "AXIOM_5_ROBUSTNESS": { "passed": boolean, "message"?: string },
    "AXIOM_6_ADAPTIVE": { "passed": boolean, "message"?: string },
    "AXIOM_7_MULTIAGENT": { "passed": boolean, "message"?: string }
  },
  "checkedAt": string
}
```

---

#### 4.3 获取效用结构 🔓

```
GET /api/v2/admin/axioms/utility/structure
```

**响应**

```typescript
{
  "topLevel": {              // 顶层维度权重
    "safety": number,
    "experience": number,
    "philosophy": number
  },
  "subDimension": {          // 子维度权重
    "safety": { "weather": number, "terrain": number, "human": number },
    "experience": { "density": number, "variety": number, "depth": number },
    "philosophy": { "alignment": number, "consistency": number, "authenticity": number }
  }
}
```

---

#### 4.4 获取系统本质 🔓

```
GET /api/v2/admin/axioms/essence
```

**响应**

```typescript
{
  "formula": "argmax_plan E_s[U(plan, s)] s.t. P_feasible ≥ θ₁, P(U < τ) ≤ θ₂",
  "description": "Risk-Constrained Hierarchical Utility Maximizer",
  "constraints": {
    "feasibilityThreshold": 0.9,
    "downsideRiskThreshold": 0.1
  },
  "explanation": string
}
```

---

### 5. 数据飞轮管理 (`/api/v2/admin/flywheel`) 🔓

> Phase 2 数据飞轮：离线学习、用户数据量统计。详见 [FLYWHEEL_ADMIN_API.md](./FLYWHEEL_ADMIN_API.md)

#### 5.1 触发离线学习 🔓

```
POST /api/v2/admin/flywheel/run-learning?userId={userId}
```

对指定用户运行 Phase 2 离线学习管道，建议 50–100 次旅行后启动。

**响应**

```typescript
{
  success: boolean;
  samplesUsed: number;
  weightChanges?: Record<string, number>;
  newVersion?: string;
  message: string;
}
```

---

#### 5.2 查看用户数据量 🔓

```
GET /api/v2/admin/flywheel/stats?userId={userId}
```

**响应**

```typescript
{
  decisionLogs: number;   // Layer 1 决策记录数
  behaviorLogs: number;   // Layer 2 用户行为数
  outcomes: number;       // Layer 3 结果捕捉数
  message: string;
}
```

---

## 类型定义

### ObjectiveFunctionWeights

```typescript
interface ObjectiveFunctionWeights {
  safety: number;           // 安全权重 [0.1, 0.5]
  experience: number;       // 体验权重 [0.05, 0.4]
  philosophy: number;       // 哲学权重 [0.05, 0.4]
  timeSlack: number;        // 时间余量 [0.02, 0.3]
  fatigueRisk: number;      // 疲劳风险 [0.05, 0.3]
  weatherRisk: number;      // 天气风险 [0.05, 0.3]
  budgetRisk: number;       // 预算风险 [0.01, 0.2]
  crowdAvoidance: number;   // 避人流 [0.01, 0.2]
}
```

### RoutePlanDraft

```typescript
interface RoutePlanDraft {
  tripId: string;
  routeDirectionId: string;
  days: DayPlan[];
  metadata: {
    totalDays: number;
    startDate: string;
    endDate: string;
  };
}

interface DayPlan {
  dayNumber: number;
  date: string;
  segments: RouteSegment[];
  overnight: {
    locationId: string;
    type: string;
  };
}
```

### WorldModelContext

```typescript
interface WorldModelContext {
  physical: PhysicalRealityModel;
  human: HumanCapabilityModel;
  routeDirection: RouteDirectionWithPhilosophy;
}
```

**HumanCapabilityModel 扩展**：`human.metadata.drivingFatigueFactors` 可用于驾驶疲劳公式，含 `sleepFactor`、`breakFactor`、`stressFactor`（0.5–1.0）。来源：UserTravelProfile.drivingFatiguePreferences → createHumanCapabilityModelFromProfile。详见 [USER_PREFERENCES_API_DOCUMENTATION.md](../USER_PREFERENCES_API_DOCUMENTATION.md#401-驾驶疲劳偏好-drivingfatiguepreferences)。

---

## 错误码

| 错误码 | HTTP 状态 | 说明 |
|--------|-----------|------|
| `INVALID_PLAN` | 400 | 计划格式无效 |
| `TEAM_NOT_FOUND` | 404 | 团队不存在 |
| `TRIP_NOT_FOUND` | 404 | 行程不存在 |
| `EXPERIMENT_NOT_FOUND` | 404 | 实验不存在 |
| `UNAUTHORIZED` | 401 | 未授权 |
| `FORBIDDEN` | 403 | 权限不足 |
| `AXIOM_VIOLATION` | 422 | 公理违规 |
| `LEARNING_FAILED` | 500 | 学习失败 |

---

## WebSocket 推送（实时状态）

订阅后，服务器通过 WebSocket 推送状态更新：

```typescript
// 连接
ws://api.tripnara.com/ws/realtime?subscriptionId=xxx

// 推送消息格式
{
  "type": "STATE_UPDATE",
  "subscriptionId": string,
  "tripId": string,
  "changes": Array<{
    "changeType": string,
    "severity": "INFO" | "WARNING" | "CRITICAL",
    "description": string,
    "previousValue": any,
    "newValue": any
  }>,
  "currentState": CurrentStateResponse,
  "timestamp": string
}
```

---

*文档版本: 2.0*
*更新时间: 2026-02-11*
