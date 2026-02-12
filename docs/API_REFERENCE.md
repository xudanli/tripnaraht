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
  "weights"?: {                // 可选：自定义权重
    "safety": number,          // 安全权重 (默认 0.25)
    "experience": number,      // 体验权重 (默认 0.20)
    "philosophy": number,      // 哲学权重 (默认 0.15)
    "timeSlack": number,       // 时间余量 (默认 0.10)
    "fatigueRisk": number,     // 疲劳风险 (默认 0.10)
    "weatherRisk": number,     // 天气风险 (默认 0.10)
    "budgetRisk": number,      // 预算风险 (默认 0.05)
    "crowdAvoidance": number   // 避人流 (默认 0.05)
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
    "safetyScore": number,     // 安全得分
    "experienceScore": number, // 体验得分
    "philosophyScore": number, // 哲学契合度
    "timeSlackScore": number,  // 时间余量得分
    "fatigueRiskScore": number,
    "weatherRiskScore": number,
    "budgetScore": number,
    "crowdScore": number
  },
  "weightsUsed": ObjectiveFunctionWeights,
  "timestamp": string
}
```

---

#### 1.2 比较两个计划

```
POST /api/v2/user/optimization/compare
```

**请求体**

```typescript
{
  "planA": RoutePlanDraft,
  "planB": RoutePlanDraft,
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

**请求体**

```typescript
{
  "plan": RoutePlanDraft,
  "world": WorldModelContext
}
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

**请求体**

```typescript
{
  "plan": RoutePlanDraft,       // 必填 - 待评估的计划
  "world": WorldModelContext,  // 必填 - 世界模型上下文
  "sampleSize"?: number        // 可选 - 默认 1000
}
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

**请求体**

```typescript
{
  "plan": RoutePlanDraft,
  "world": WorldModelContext
}
```

**响应**

```typescript
{
  "decision": "APPROVE" | "APPROVE_WITH_CONDITIONS" | "REJECT" | "NEEDS_HUMAN",
  "consensusLevel": number,            // 共识度 (0-1)
  "keyTradeoffs": string[],            // 关键权衡点
  "conditions"?: string[],             // 附加条件
  "humanDecisionPoints"?: string[],    // 需人类决策的点
  "evaluationSummary": {
    "abuUtility": number,              // Abu 评估效用
    "dreUtility": number,              // Dre 评估效用
    "neptuneUtility": number,          // Neptune 评估效用
    "criticalConcerns": string[]       // 关键关注点
  },
  "votingResult": {
    "approve": number,
    "reject": number,
    "abstain": number
  }
}
```

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
```

**请求体**

```typescript
{
  "plan": RoutePlanDraft,
  "world": WorldModelContext
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
// 推荐的前端轮询逻辑
async function getRealtimeState(tripId: string) {
  try {
    // 1. 先检查状态是否存在
    const checkRes = await fetch(`/api/v2/user/realtime/state/${tripId}/exists`);
    const { exists } = await checkRes.json();
    
    if (!exists) {
      // 2. 如果不存在，初始化状态
      await fetch('/api/v2/user/realtime/state/initialize', {
        method: 'POST',
        body: JSON.stringify({ tripId })
      });
    }
    
    // 3. 获取状态
    const stateRes = await fetch(`/api/v2/user/realtime/state/${tripId}`);
    if (stateRes.status === 404) {
      // 状态未初始化，停止轮询并显示提示
      return { initialized: false, message: '实时状态暂不可用' };
    }
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
```

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

---

#### 3.6 预测未来状态

```
GET /api/v2/user/realtime/state/:tripId/predict?hoursAhead=24
```

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
