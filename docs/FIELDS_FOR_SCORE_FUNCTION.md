# Plan / WorldState / Objective 关键字段摘要

用于 ToT 评分函数权重设计的字段清单

## 一、成本相关字段 (Cost)

### 1.1 ActivityCandidate (候选活动)
```typescript
cost?: CostEstimate {
  amount: number;           // 金额
  currency: MoneyCurrency;  // 货币单位
  unit?: string;            // 单位（如 'per_person', 'per_booking'）
}
```

### 1.2 TripContextState (行程上下文)
```typescript
budget?: {
  amount: number;           // 预算总额
  currency: MoneyCurrency;  // 货币单位
  style?: 'low' | 'medium' | 'high';  // 预算风格
}
```

### 1.3 TripPlan.metrics (计划指标)
```typescript
metrics?: {
  estTotalCost?: number;    // 预估总成本
}
```

### 1.4 PlanRequest.objective_weights (目标权重)
```typescript
objective_weights?: {
  soft_cost?: number;       // 软节点成本权重（默认 1.0）
}
```

### 1.5 PlanningPolicy.weights (规划策略权重)
```typescript
weights: SoftWeights {
  valueOfTimePerMin: number;  // 时间价值（元/分钟），用于时间-金钱 tradeoff
}
```

---

## 二、风险相关字段 (Risk)

### 2.1 ActivityCandidate (候选活动)
```typescript
riskLevel?: RiskLevel;      // 'low' | 'medium' | 'high'
weatherSensitivity?: 0 | 1 | 2 | 3;  // 0 不敏感, 3 非常敏感
inventoryRisk?: 1 | 2 | 3 | 4 | 5;    // 库存风险（如旅游团售罄）
bookingDifficulty?: 1 | 2 | 3 | 4 | 5;  // 预订难度
requiresBooking?: boolean;   // 是否需要预订
```

### 2.2 UserPreferenceProfile (用户偏好)
```typescript
riskTolerance: RiskLevel;   // 'low' | 'medium' | 'high'
```

### 2.3 OptimizationResult.robustness (优化结果稳健度)
```typescript
robustness?: {
  total_buffer_minutes: number;      // 总缓冲时间（分钟）
  total_wait_minutes: number;        // 总等待时间（分钟）
  top3_min_slack_nodes: Array<{      // 最紧张的 3 个节点剩余时间
    node_id: number;
    slack_min: number;
  }>;
  risk_level?: 'low' | 'medium' | 'high';  // 风险等级
}
```

### 2.4 PlanDay.terrainFacts (地形事实)
```typescript
terrainFacts?: {
  riskFlags?: Array<{
    type: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    message: string;
  }>;
}
```

### 2.5 ObjectiveWeights (目标权重)
```typescript
violationRisk: number;      // 违约风险权重（赶不上、闭馆、超预算）
robustness: number;         // 鲁棒性权重（天气变化能快速替换）
```

### 2.6 PlanningPolicy.context (规划策略上下文)
```typescript
context: UserContext {
  riskTolerance?: RiskTolerance;  // 'LOW' | 'MEDIUM' | 'HIGH'
}
```

---

## 三、偏好相关字段 (Preference)

### 3.1 UserPreferenceProfile (用户偏好)
```typescript
intents: Record<string, number>;  // 兴趣权重，如 { nature: 0.8, culture: 0.4 }
pace: 'relaxed' | 'moderate' | 'intense';  // 节奏偏好
riskTolerance: RiskLevel;         // 风险容忍度
maxDailyActiveMinutes?: number;   // 每日最大活跃分钟数（能量预算代理）
dislikeTags?: string[];           // 不喜欢的标签
```

### 3.2 ActivityCandidate (候选活动)
```typescript
intentTags?: string[];      // 意图标签（兴趣分类）
qualityScore?: number;      // 质量分数 0~1
uniquenessScore?: number;    // 独特性分数 0~1
mustSee?: boolean;          // 是否为必看景点（精选/用户"必做"）
```

### 3.3 ObjectiveWeights (目标权重)
```typescript
satisfaction: number;       // 满意度权重（偏好匹配、体验多样性）
```

### 3.4 PlanningPolicy.weights (规划策略权重)
```typescript
weights: SoftWeights {
  tagAffinity: Record<string, number>;  // POI标签权重，如 { museum: 1.2, playground: 1.5 }
  diversityPenalty: number;             // 同类过多惩罚
  mustSeeBoost: number;                 // 必去景点加成
}
```

### 3.5 PlanRequest.pacing (规划偏好)
```typescript
pacing?: 'relaxed' | 'normal' | 'intense';
```

---

## 四、时间窗相关字段 (Time Window)

### 4.1 PlanNode (规划节点)
```typescript
time_windows?: Array<[string, string]>;  // 多时间窗，如 [["05:00","14:00"], ["18:00","22:00"]]
service_duration_min: number;             // 服务时长（分钟）
```

### 4.2 ActivityCandidate (候选活动)
```typescript
openingHours?: OpeningHours[];  // 营业时间（针对行程范围内的日期）
  // OpeningHours {
  //   date: ISODate;
  //   windows: TimeWindow[];  // { start: ISOTime, end: ISOTime }
  // }
durationMin: number;            // 典型时长（分钟）
durationMaxMin?: number;         // 最大时长（分钟，可选）
```

### 4.3 TripWorldState.policies (世界状态策略)
```typescript
policies?: {
  dayStart?: ISOTime;      // 如 '08:00'
  dayEnd?: ISOTime;        // 如 '21:00'
  bufferMinBetweenActivities?: number;  // 活动间缓冲分钟数，如 10
}
```

### 4.4 PlanRequest (规划请求)
```typescript
day_boundary: {
  start: string;  // "09:00"
  end: string;   // "22:00"
};
lifestyle_policy?: {
  earliest_first_stop?: string;  // 最早第一站时间，如 "09:00"
  lunch_break?: {
    enabled: boolean;
    duration_min: number;         // 默认 60
    window: [string, string];     // ["11:30", "13:30"]
  };
};
```

### 4.5 OptimizationResult.summary (优化结果摘要)
```typescript
summary: {
  total_travel_min: number;    // 总旅行时间（分钟）
  total_wait_min: number;      // 总等待时间（分钟）
  total_service_min: number;   // 总服务时间（分钟）
  total_day_min: number;       // 总日时长（分钟）
}
```

### 4.6 OptimizationResult.diagnostics (诊断信息)
```typescript
diagnostics?: {
  critical_windows?: Array<{
    node_id: number;
    slack_to_close_min: number;  // 距离关闭的剩余时间（分钟）
  }>;
}
```

### 4.7 PlanRequest.objective_weights (目标权重)
```typescript
objective_weights?: {
  travel?: number;  // 旅行时间权重（默认 1.0）
  wait?: number;    // 等待时间权重（默认 1.5）
}
```

---

## 五、必达点相关字段 (Required Points / Hard Constraints)

### 5.1 PlanNode.constraints (节点约束)
```typescript
constraints?: {
  is_hard_node?: boolean;      // 是否为硬节点（必须访问）
  priority_level?: number;      // 优先级（1=最高, 5=最低）
  drop_penalty?: number;        // 丢弃惩罚（如果未设置，根据 priority_level 计算）
  reward?: number;              // 访问奖励
}
```

### 5.2 ActivityCandidate (候选活动)
```typescript
mustSee?: boolean;  // 是否为必看景点（精选/用户"必做"）
```

### 5.3 PlanSlot (计划时段)
```typescript
priorityTag?: 'anchor' | 'core' | 'optional';  // 优先级标签
locked?: boolean;                              // 用户锁定/已预订
```

### 5.4 TripContextState.anchors (行程锚点)
```typescript
anchors?: {
  hotelLocationsByDate?: Record<ISODate, GeoPoint>;  // 按日期的酒店位置（硬约束）
  fixedEvents?: Array<{                              // 固定事件（硬约束）
    date: ISODate;
    start: ISOTime;
    end: ISOTime;
    title: string;
  }>;
}
```

### 5.5 PlanRequest.objective_weights (目标权重)
```typescript
objective_weights?: {
  drop_penalty?: number;  // 丢弃惩罚权重（默认 1.0）
  reward?: number;        // 奖励权重（默认 1.0）
}
```

### 5.6 PlanningPolicy.constraints (规划策略硬约束)
```typescript
constraints: HardConstraints {
  requireWheelchairAccess: boolean;      // 必须轮椅可达
  forbidStairs: boolean;                 // 禁止楼梯
  maxTransfers: number;                  // 最大换乘次数
  maxSingleWalkMin: number;              // 单段步行分钟上限
  maxTotalWalkMinPerDay: number;         // 每日总步行分钟上限
  mustHaveRestroomEveryMin: number;      // 必须每隔X分钟有洗手间
}
```

### 5.7 DropReasonCode (丢弃原因码)
```typescript
enum DropReasonCode {
  TIME_WINDOW_CONFLICT = 'TIME_WINDOW_CONFLICT',           // 时间窗冲突
  INSUFFICIENT_TOTAL_TIME = 'INSUFFICIENT_TOTAL_TIME',    // 总时长超标
  CLOSED_DAY = 'CLOSED_DAY',                              // 闭馆日/停业日
  HIGH_WAIT_TIME = 'HIGH_WAIT_TIME',                      // 等待过长
  LOW_PRIORITY_NOT_WORTH = 'LOW_PRIORITY_NOT_WORTH',      // 低优先级不值得
  HARD_NODE_PROTECTION = 'HARD_NODE_PROTECTION',          // 为保证必去点可行而丢弃
  ROBUST_TIME_INFEASIBLE = 'ROBUST_TIME_INFEASIBLE',      // 鲁棒时间不可行
  EARLY_DEPARTURE_CONFLICT = 'EARLY_DEPARTURE_CONFLICT',  // 早起限制冲突
}
```

---

## 六、其他重要字段

### 6.1 旅行相关
```typescript
// TravelLeg (旅行段)
TravelLeg {
  mode: TravelMode;           // 'walk' | 'drive' | 'transit' | 'rideshare' | 'bike'
  durationMin: number;        // 预测时长（分钟）
  distanceKm?: number;        // 距离（公里）
  reliability?: number;       // 可靠性 0~1
}

// TripPlan.metrics
metrics?: {
  estTravelMinutes?: number;  // 预估旅行分钟数
  estActiveMinutes?: number;  // 预估活跃分钟数
  robustnessScore?: number;   // 稳健度分数 0~1
}
```

### 6.2 地理相关
```typescript
// ActivityCandidate.location
location?: {
  point: GeoPoint;      // { lat: number, lng: number }
  address?: string;
  region?: string;      // 区域ID（用于跨区惩罚）
}

// PlanNode.meta
meta?: {
  region_id?: string;   // 区域ID（用于跨区惩罚）
  tags?: string[];      // 标签
  disjunction_group_id?: number;  // 互斥组ID（同一组最多选1个）
}
```

### 6.3 交通策略
```typescript
// PlanRequest.transport_policy
transport_policy?: {
  buffer_factor?: number;              // 缓冲因子（默认 1.2）
  fixed_buffer_min?: number;           // 固定缓冲（分钟，默认 15）
  switch_cost_min?: {                 // 交通模态切换成本（分钟）
    'walk->metro'?: number;
    'metro->taxi'?: number;
    'taxi->walk'?: number;
    [key: string]: number | undefined;
  };
  cross_region_cost_min?: number;     // 跨区惩罚（分钟，默认 8）
}
```

---

## 七、现有评分函数参考

### 7.1 ObjectiveWeights (目标权重配置)
```typescript
// src/trips/decision/config/objective-config.ts
export interface ObjectiveWeights {
  satisfaction: number;    // 满意度权重（偏好匹配、体验多样性）
  violationRisk: number;   // 违约风险权重（赶不上、闭馆、超预算）
  robustness: number;      // 鲁棒性权重（天气变化能快速替换）
  cost: number;           // 成本权重
}
```

### 7.2 PlanRequest.objective_weights (单日优化权重)
```typescript
objective_weights?: {
  travel?: number;      // 旅行时间权重（默认 1.0）
  wait?: number;       // 等待时间权重（默认 1.5）
  soft_cost?: number;  // 软节点成本权重（默认 1.0）
  drop_penalty?: number; // 丢弃惩罚权重（默认 1.0）
  reward?: number;     // 奖励权重（默认 1.0）
}
```

### 7.3 PolicyProfile (策略配置)
```typescript
// 包含 abuConfig 和 drdreConfig 的详细权重配置
// 见 src/trips/decision/config/objective-config.ts
```

---

## 八、字段使用建议

### 8.1 成本维度
- **直接成本**: `ActivityCandidate.cost.amount`
- **预算约束**: `TripContextState.budget.amount`
- **成本权重**: `ObjectiveWeights.cost` 或 `PlanRequest.objective_weights.soft_cost`
- **时间-金钱权衡**: `PlanningPolicy.weights.valueOfTimePerMin`

### 8.2 风险维度
- **活动风险**: `ActivityCandidate.riskLevel`, `weatherSensitivity`, `inventoryRisk`
- **用户风险容忍度**: `UserPreferenceProfile.riskTolerance`
- **计划风险**: `OptimizationResult.robustness.risk_level`, `top3_min_slack_nodes`
- **风险权重**: `ObjectiveWeights.violationRisk`, `ObjectiveWeights.robustness`

### 8.3 偏好维度
- **兴趣匹配**: `UserPreferenceProfile.intents` vs `ActivityCandidate.intentTags`
- **质量偏好**: `ActivityCandidate.qualityScore`, `uniquenessScore`
- **必看标记**: `ActivityCandidate.mustSee`
- **偏好权重**: `ObjectiveWeights.satisfaction`, `PlanningPolicy.weights.tagAffinity`

### 8.4 时间窗维度
- **节点时间窗**: `PlanNode.time_windows`
- **营业时间**: `ActivityCandidate.openingHours`
- **日界约束**: `PlanRequest.day_boundary`, `TripWorldState.policies.dayStart/dayEnd`
- **等待时间**: `OptimizationResult.summary.total_wait_min`
- **时间权重**: `PlanRequest.objective_weights.travel`, `wait`

### 8.5 必达点维度
- **硬节点标记**: `PlanNode.constraints.is_hard_node`
- **优先级**: `PlanNode.constraints.priority_level` (1=最高, 5=最低)
- **丢弃惩罚**: `PlanNode.constraints.drop_penalty`
- **访问奖励**: `PlanNode.constraints.reward`
- **锚点约束**: `TripContextState.anchors.hotelLocationsByDate`, `fixedEvents`
- **必达权重**: `PlanRequest.objective_weights.drop_penalty`, `reward`

---

## 九、ToT 评分函数设计建议

### 9.1 多维度评分结构
建议将评分函数拆分为以下维度：
1. **成本得分** (Cost Score): 基于预算利用率和成本效率
2. **风险得分** (Risk Score): 基于违约风险和鲁棒性
3. **偏好得分** (Preference Score): 基于兴趣匹配和体验质量
4. **时间窗得分** (Time Window Score): 基于时间窗满足度和等待时间
5. **必达点得分** (Required Points Score): 基于必达点覆盖率和优先级

### 9.2 权重配置策略
- **默认权重**: 基于 `PolicyProfile` 的预设策略（relaxed/moderate/intense/family/photography/adventure）
- **动态调整**: 根据 `UserPreferenceProfile` 和 `TripContextState` 动态调整
- **场景适配**: 根据 `PlanningPolicy.context` 中的场景特征（hasLuggage, hasElderly, isRaining等）调整权重

### 9.3 归一化建议
- 所有得分应归一化到 [0, 1] 或 [-1, 1] 区间
- 使用加权求和或加权几何平均
- 考虑使用 Pareto 前沿方法处理多目标优化

