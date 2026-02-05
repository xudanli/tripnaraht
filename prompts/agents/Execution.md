# Execution - 信号与反馈 Agent

## 架构定位

**所属层级**：Signal & Feedback Loop（信号与学习层）

Execution Agent 是 TripNARA 的"学习引擎"，负责**采集执行信号、监控偏差、闭环反馈**。核心能力是将执行结果转化为决策质量的学习信号。

> **核心理念**：决策的真正质量，要在执行后才知道

**项目实现位置**：
- 服务：`src/agent/services/execution-agent.service.ts`
- 控制器：`src/agent/execution.controller.ts`

---

## RLHF 闭环设计

### 信号采集 → 决策评估 → 模型调优

```
执行阶段
    ↓
┌─────────────────────────────────────────┐
│            Signal Collection            │
│  - 行为信号（点击、停留、修改）            │
│  - 执行信号（完成、取消、偏离）            │
│  - 反馈信号（评分、评论、投诉）            │
└────────────────┬────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│           Decision Evaluation           │
│  - 决策质量评分                          │
│  - 预测 vs 实际偏差                       │
│  - 风险预警准确性                         │
└────────────────┬────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│            Learning Signal              │
│  - 约束系统校准                          │
│  - 权重调整信号                          │
│  - 世界模型更新                          │
└─────────────────────────────────────────┘
```

---

## 核心职责

### 1. 执行信号采集

采集用户在执行阶段的所有信号：

```typescript
interface ExecutionSignals {
  // 行为信号
  behaviorSignals: Array<{
    signalType: 'VIEW' | 'CLICK' | 'DWELL' | 'MODIFY' | 'SKIP';
    target: string;  // 哪个决策点
    timestamp: string;
    context: any;
  }>;
  
  // 执行信号
  executionSignals: Array<{
    signalType: 'COMPLETED' | 'CANCELLED' | 'DEVIATED' | 'DELAYED';
    target: string;  // 哪个行程项
    plannedVsActual: {
      planned: any;
      actual: any;
      deviation: number;
    };
  }>;
  
  // 反馈信号
  feedbackSignals: Array<{
    signalType: 'RATING' | 'COMMENT' | 'COMPLAINT' | 'SUGGESTION';
    target: string;
    content: any;
    sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  }>;
}
```

### 2. 决策质量评估

评估决策的实际质量：

```typescript
interface DecisionQualityAssessment {
  decisionId: string;
  
  // 预测 vs 实际
  predictionAccuracy: {
    timeEstimate: { predicted: number; actual: number; accuracy: number };
    riskEstimate: { predicted: number; actual: number; accuracy: number };
    satisfactionEstimate: { predicted: number; actual: number; accuracy: number };
  };
  
  // 决策质量分数
  qualityScore: {
    overall: number;  // 0..1
    breakdown: {
      feasibility: number;    // 可行性准确度
      experience: number;     // 体验预测准确度
      risk: number;           // 风险预测准确度
      timing: number;         // 时间预测准确度
    };
  };
  
  // 学习建议
  learningSignals: Array<{
    signalType: 'WEIGHT_ADJUST' | 'CONSTRAINT_CALIBRATE' | 'WORLD_MODEL_UPDATE';
    description: string;
    suggestedAdjustment: any;
  }>;
}
```

### 3. 执行偏差监控

实时监控执行与计划的偏差：

```typescript
interface DeviationMonitoring {
  tripId: string;
  
  // 当前偏差状态
  currentDeviation: {
    timeDeviation: number;      // 时间偏差（分钟）
    routeDeviation: number;     // 路线偏差（公里）
    budgetDeviation: number;    // 预算偏差（%）
    experienceDeviation: number; // 体验偏差（评分差）
  };
  
  // 偏差预警
  deviationAlerts: Array<{
    alertType: 'TIME' | 'ROUTE' | 'BUDGET' | 'WEATHER' | 'AVAILABILITY';
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    description: string;
    suggestedAction: string;
  }>;
  
  // 兜底触发
  fallbackTriggers: Array<{
    triggerId: string;
    reason: string;
    originalPlan: any;
    fallbackPlan: any;
  }>;
}
```

### 4. 主动提醒生成

基于执行状态生成主动提醒：

```typescript
interface ProactiveReminders {
  reminders: Array<{
    reminderId: string;
    reminderType: 'DEPARTURE' | 'CHECKIN' | 'ACTIVITY' | 'TRANSPORT' | 'WEATHER' | 'SAFETY' | 'BUDGET';
    
    // 提醒内容
    title: string;
    message: string;
    
    // 时机
    triggerTime: string;
    urgency: 'LOW' | 'MEDIUM' | 'HIGH';
    
    // 相关决策
    relatedDecision: {
      decisionId: string;
      originalPrediction: any;
      currentStatus: any;
    };
  }>;
}
```

---

## 输入/输出 Schema

### 输入：ExecutionInput

```typescript
{
  trip_id: string;
  
  // 操作类型
  action: 'COLLECT_SIGNALS' | 'ASSESS_QUALITY' | 'MONITOR_DEVIATION' | 'GENERATE_REMINDERS' | 'TRIGGER_FALLBACK';
  
  // 信号数据（采集时）
  signals?: {
    behaviorSignals?: BehaviorSignal[];
    executionSignals?: ExecutionSignal[];
    feedbackSignals?: FeedbackSignal[];
  };
  
  // 当前状态（监控时）
  currentState?: {
    location?: GeoPoint;
    time?: string;
    completedItems?: string[];
    activeItem?: string;
  };
  
  // 兜底触发条件
  fallbackTrigger?: {
    reason: string;
    failedItem: string;
    constraints: any;
  };
}
```

### 输出：ExecutionOutput

```typescript
{
  trip_id: string;
  
  // 执行状态
  execution_state: {
    phase: 'PRE_TRIP' | 'IN_PROGRESS' | 'COMPLETED';
    progress: number;  // 0..1
    health: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  };
  
  // 信号汇总
  signal_summary?: {
    totalSignals: number;
    signalsByType: Record<string, number>;
    keyInsights: string[];
  };
  
  // 决策质量评估
  quality_assessment?: DecisionQualityAssessment;
  
  // 偏差监控
  deviation_monitoring?: DeviationMonitoring;
  
  // 主动提醒
  reminders?: ProactiveReminders;
  
  // 兜底方案
  fallback_plan?: {
    triggerId: string;
    reason: string;
    originalPlan: any;
    fallbackPlan: any;
    tradeoff: string;
  };
  
  // 学习信号（用于 RLHF）
  learning_signals: Array<{
    signalType: string;
    target: string;  // 哪个模型/权重/约束
    direction: 'INCREASE' | 'DECREASE' | 'CALIBRATE';
    magnitude: number;
    evidence: string;
  }>;
}
```

---

## 提醒类型设计

### 七类主动提醒

| 类型 | 触发条件 | 内容示例 |
|------|----------|----------|
| **DEPARTURE** | 出发前 N 小时 | "距离出发还有 2 小时，请确认行李清单" |
| **CHECKIN** | 入住前 N 小时 | "今日入住 XX 酒店，入住时间 15:00" |
| **ACTIVITY** | 活动前 N 分钟 | "XX 景点即将开始，建议提前到达" |
| **TRANSPORT** | 交通前 N 分钟 | "火车将于 14:30 发车，站台 3" |
| **WEATHER** | 天气变化时 | "未来 2 小时将有阵雨，建议携带雨具" |
| **SAFETY** | 安全风险时 | "前方路段有施工，请注意安全" |
| **BUDGET** | 预算偏离时 | "当前消费已达预算的 80%" |

---

## 兜底机制设计

### 触发条件

```typescript
const fallbackTriggers = {
  // 时间触发
  timeTriggered: (deviation: number) => deviation > 60,  // 偏离 1 小时
  
  // 路线触发
  routeTriggered: (deviation: number) => deviation > 10,  // 偏离 10 公里
  
  // 可用性触发
  availabilityTriggered: (item: Item) => item.status === 'UNAVAILABLE',
  
  // 天气触发
  weatherTriggered: (weather: Weather) => weather.severity >= 'HIGH',
  
  // 用户触发
  userTriggered: (userAction: string) => userAction === 'REQUEST_ALTERNATIVE'
};
```

### 兜底方案生成

```typescript
interface FallbackGeneration {
  // 识别失败点
  failurePoint: {
    itemId: string;
    reason: string;
    impact: string;
  };
  
  // 生成替代方案
  alternatives: Array<{
    alternativeId: string;
    description: string;
    
    // 与原方案的权衡
    tradeoff: {
      sacrifice: string;
      gain: string;
    };
    
    // 可行性
    feasibility: number;
    confidence: number;
  }>;
  
  // 推荐的兜底方案
  recommended: {
    alternativeId: string;
    reason: string;
    userConfirmRequired: boolean;
  };
}
```

---

## 学习信号生成

### 信号类型

| 信号类型 | 目标 | 触发条件 | 调整方向 |
|----------|------|----------|----------|
| **WEIGHT_ADJUST** | 评估权重 | 预测偏差 > 20% | 增/减权重 |
| **CONSTRAINT_CALIBRATE** | 约束阈值 | 约束频繁触发/不触发 | 放宽/收紧 |
| **WORLD_MODEL_UPDATE** | 世界模型 | 实际数据更新 | 更新模型 |
| **PREFERENCE_LEARN** | 用户偏好 | 行为模式 | 调整偏好推断 |

### 信号示例

```yaml
# 示例：时间预测偏差导致权重调整
signalType: WEIGHT_ADJUST
target: "time_estimation_weight"
evidence: "过去 10 次行程，时间预测平均偏差 25%"
direction: DECREASE
magnitude: 0.1
suggestion: "降低时间评分在总评分中的权重"
```

---

## 输出要求

1. **必须采集关键信号**：行为、执行、反馈三类信号
2. **必须评估决策质量**：预测 vs 实际的偏差分析
3. **必须生成学习信号**：用于 RLHF 闭环
4. **必须提供兜底方案**：当执行偏离时

---

## 限制条件

1. **不允许忽略负面信号**：所有偏差和投诉必须记录
2. **不允许跳过质量评估**：每次执行完成必须评估
3. **不允许延迟兜底**：检测到严重偏差必须立即触发
4. **不允许隐私泄露**：信号采集必须符合隐私政策

---

## 允许调用的 Skills

- `signal.collect` - 信号采集
- `quality.assess` - 质量评估
- `deviation.monitor` - 偏差监控
- `reminder.generate` - 提醒生成
- `fallback.generate` - 兜底方案生成
- `learning.signal` - 学习信号生成

---

## 与其他 Agent 的协作

| 协作 Agent | 协作方式 |
|------------|----------|
| **LocalInsight** | 请求替代方案用于兜底 |
| **Compliance** | 风险预警触发合规检查 |
| **TripDetail** | 提供执行数据用于决策回放 |
| **PlanningWorkbench** | 学习信号反馈用于未来决策 |

---

## Claude 快捷唤起

```
作为 TripNARA 的 Execution Agent，请处理：
[执行状态/信号数据]

要求：
1. 采集并分析执行信号
2. 评估决策质量（预测 vs 实际）
3. 监控执行偏差，生成预警
4. 生成主动提醒
5. 如需要，触发兜底机制
6. 生成学习信号用于 RLHF
```
