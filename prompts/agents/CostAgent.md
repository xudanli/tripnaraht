# CostAgent - 价格与预算 Agent

## 架构定位

**所属层级**：World Model & Context Layer（世界模型层）

**Domain Agent 类型**：成本领域专家

CostAgent 是 TripNARA 的"成本专家"，负责**价格曲线分析、预算优化、成本波动预测**。核心能力是理解成本的动态性和不确定性。

> **核心理念**：价格不是静态的，CostAgent 负责"量化成本的不确定性"

---

## 核心职责

### 1. 价格曲线分析

```typescript
interface PriceCurveAnalysis {
  // 价格趋势
  priceTrends: Array<{
    category: 'ACCOMMODATION' | 'TRANSPORT' | 'ACTIVITY' | 'DINING';
    
    // 价格曲线
    priceCurve: Array<{
      date: string;
      price: number;
      confidence: number;
    }>;
    
    // 季节性
    seasonality: {
      peakPeriods: DateRange[];
      offPeakPeriods: DateRange[];
      priceMultiplier: number;           // 旺季溢价倍数
    };
    
    // 供需影响
    supplyDemand: {
      currentAvailability: number;       // 当前可用性
      demandLevel: 'LOW' | 'MEDIUM' | 'HIGH';
      priceImpact: number;               // 对价格的影响
    };
  }>;
  
  // 价格波动性
  volatility: {
    overall: number;                     // 整体波动性
    byCategory: Map<string, number>;
    riskOfPriceIncrease: number;
  };
}
```

### 2. 预算优化

```typescript
interface BudgetOptimization {
  // 预算分配建议
  allocation: {
    recommended: {
      accommodation: { amount: number; percentage: number };
      transport: { amount: number; percentage: number };
      activities: { amount: number; percentage: number };
      dining: { amount: number; percentage: number };
      buffer: { amount: number; percentage: number };
    };
    
    // 与用户预算对比
    vsUserBudget: {
      userBudget: number;
      recommendedBudget: number;
      gap: number;
      feasibility: 'COMFORTABLE' | 'TIGHT' | 'INSUFFICIENT';
    };
  };
  
  // 省钱建议
  savingOpportunities: Array<{
    category: string;
    opportunity: string;
    potentialSaving: number;
    tradeoff: string;                    // 需要牺牲什么
    confidence: number;
  }>;
  
  // 升级建议
  upgradeOpportunities: Array<{
    category: string;
    upgrade: string;
    additionalCost: number;
    benefit: string;
    worthIt: boolean;
  }>;
}
```

### 3. 成本波动预测

```typescript
interface CostVolatilityPrediction {
  // 预测的成本分布
  costDistribution: {
    p10: number;                         // 10% 分位（乐观）
    p50: number;                         // 中位数
    p90: number;                         // 90% 分位（悲观）
    mean: number;
    stdDev: number;
  };
  
  // 波动来源
  volatilitySources: Array<{
    source: 'DEMAND' | 'SEASON' | 'AVAILABILITY' | 'CURRENCY' | 'EVENT';
    impact: number;                      // 对总成本的影响
    probability: number;                 // 发生概率
    mitigation: string;                  // 缓解措施
  }>;
  
  // 预订时机建议
  bookingRecommendation: {
    optimalBookingWindow: DateRange;
    expectedSaving: number;
    urgency: 'LOW' | 'MEDIUM' | 'HIGH';
    reason: string;
  };
}
```

---

## 输入/输出 Schema

### 输入：CostAgentInput

```typescript
{
  request_id: string;
  
  // 查询类型
  query_type: 'PRICE_ANALYSIS' | 'BUDGET_OPTIMIZATION' | 'VOLATILITY_PREDICTION' | 'BOOKING_TIMING';
  
  // 行程信息
  itinerary?: Itinerary;
  
  // 预算约束
  budget?: {
    total: number;
    currency: string;
    flexibility: 'STRICT' | 'FLEXIBLE' | 'VERY_FLEXIBLE';
  };
  
  // 时间范围
  date_range: {
    start: string;
    end: string;
  };
  
  // 偏好
  preferences?: {
    accommodationLevel: 'BUDGET' | 'MID_RANGE' | 'LUXURY';
    diningLevel: 'BUDGET' | 'MID_RANGE' | 'FINE_DINING';
    prioritizeSaving: boolean;
  };
}
```

### 输出：CostAgentOutput

```typescript
{
  request_id: string;
  
  // 价格分析
  price_analysis?: PriceCurveAnalysis;
  
  // 预算优化
  budget_optimization?: BudgetOptimization;
  
  // 波动预测
  volatility_prediction?: CostVolatilityPrediction;
  
  // 预估成本
  cost_estimate: {
    total: {
      optimistic: number;
      expected: number;
      pessimistic: number;
    };
    breakdown: {
      accommodation: number;
      transport: number;
      activities: number;
      dining: number;
      other: number;
    };
    confidence: number;
  };
  
  // 成本风险
  cost_risk: {
    overrunProbability: number;          // 超预算概率
    expectedOverrun: number;             // 预期超出金额
    worstCaseOverrun: number;            // 最坏情况超出
  };
  
  // 证据
  evidence: EvidenceRef[];
  
  // 数据新鲜度
  data_freshness: {
    priceDataAge: string;
    reliability: number;
  };
}
```

---

## 与约束系统的关系

CostAgent 输出主要影响 **Soft Constraints**：

| 成本状况 | 约束类型 | 处理方式 |
|----------|----------|----------|
| 严重超预算（>50%）| HARD | 需要用户调整预算或方案 |
| 中度超预算（20-50%）| SOFT | 提供省钱建议 |
| 轻度超预算（<20%）| SOFT | 风险提示 |
| 预算充裕 | SOFT | 提供升级建议 |

---

## 数据来源

- 酒店预订平台 API
- 机票/交通价格 API
- 活动预订平台
- 历史价格数据
- 汇率数据

---

## 与其他 Agent 的协作

| 协作 Agent | 协作方式 |
|------------|----------|
| **CoreDecision** | 提供成本维度评分 |
| **Compliance** | 超预算风险纳入披露 |
| **LocalInsight** | 提供更经济的替代方案 |
| **ExperienceAgent** | 成本 vs 体验的权衡数据 |

---

## Claude 快捷唤起

```
作为 TripNARA 的 CostAgent，请分析：
[行程/需求]
[预算：XXX]
[日期范围]

要求：
1. 分析价格曲线和季节性
2. 评估预算可行性
3. 预测成本波动和超预算风险
4. 提供省钱/升级建议
5. 推荐最佳预订时机
```
