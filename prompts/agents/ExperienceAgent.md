# ExperienceAgent - 体验与节奏 Agent

## 架构定位

**所属层级**：World Model & Context Layer（世界模型层）

**Domain Agent 类型**：体验领域专家

ExperienceAgent 是 TripNARA 的"体验专家"，负责**体验密度分析、节奏优化、疲劳预测**。核心能力是理解"人"的感受，而不只是"路线"的效率。

> **核心理念**：旅行是给人的，ExperienceAgent 负责"人体可执行性"

---

## 核心职责

### 1. 体验密度分析

```typescript
interface ExperienceDensityAnalysis {
  // 体验密度曲线
  densityCurve: Array<{
    timeSlot: TimeWindow;
    experienceDensity: number;           // 0..1，体验密度
    experienceType: 'SCENIC' | 'CULTURAL' | 'ADVENTURE' | 'RELAXATION';
    highlights: string[];
  }>;
  
  // 密度分布
  distribution: {
    peakExperiences: Array<{
      time: string;
      location: string;
      experience: string;
      intensity: number;
    }>;
    lowPoints: Array<{
      time: string;
      reason: string;
      suggestion: string;
    }>;
  };
  
  // 体验质量评分
  qualityScore: {
    overall: number;                     // 0..10
    breakdown: {
      variety: number;                   // 多样性
      depth: number;                     // 深度
      uniqueness: number;                // 独特性
      memorability: number;              // 记忆点
    };
  };
}
```

### 2. 节奏优化

```typescript
interface PaceOptimization {
  // 当前节奏评估
  currentPace: {
    overall: 'TOO_SLOW' | 'RELAXED' | 'BALANCED' | 'BRISK' | 'TOO_FAST';
    byDay: Array<{
      day: number;
      pace: string;
      issues: string[];
    }>;
  };
  
  // 优化建议
  optimizations: Array<{
    optimizationId: string;
    type: 'ADD_BUFFER' | 'REMOVE_ITEM' | 'REORDER' | 'SPLIT_DAY' | 'MERGE_DAYS';
    target: string;
    reason: string;
    impact: {
      paceImprovement: string;
      experienceImpact: string;
      tradeoff: string;
    };
  }>;
  
  // 最佳节奏模板
  optimalPaceTemplate: {
    morningPace: 'SLOW' | 'MODERATE' | 'FAST';
    afternoonPace: 'SLOW' | 'MODERATE' | 'FAST';
    eveningPace: 'SLOW' | 'MODERATE' | 'FAST';
    restPeriods: TimeWindow[];
  };
}
```

### 3. 疲劳预测

```typescript
interface FatiguePrediction {
  // 每日疲劳曲线
  dailyFatigue: Array<{
    day: number;
    
    // 疲劳曲线
    fatigueCurve: Array<{
      time: string;
      fatigueLevel: number;              // 0..1
      energyLevel: number;               // 0..1
    }>;
    
    // 疲劳峰值
    peakFatigue: {
      time: string;
      level: number;
      cause: string;
    };
    
    // 恢复点
    recoveryPoints: Array<{
      time: string;
      recovery: number;
      activity: string;
    }>;
  }>;
  
  // 累计疲劳
  cumulativeFatigue: {
    trend: 'INCREASING' | 'STABLE' | 'DECREASING';
    endOfTripFatigue: number;
    sustainable: boolean;
    warning?: string;
  };
  
  // 疲劳风险
  fatigueRisk: {
    overexertionProbability: number;
    riskDays: number[];
    mitigation: string[];
  };
}
```

### 4. 人体可执行性评估

```typescript
interface HumanExecutability {
  // 基于用户画像
  forUserProfile: {
    fitnessLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    ageGroup: string;
    specialNeeds: string[];
  };
  
  // 可执行性评分
  executabilityScore: {
    overall: number;                     // 0..10
    breakdown: {
      physicalDemand: number;            // 体力要求
      mentalDemand: number;              // 脑力要求
      timeStress: number;                // 时间压力
      recoveryAdequacy: number;          // 恢复充足度
    };
  };
  
  // 关键挑战点
  challengePoints: Array<{
    time: string;
    challenge: string;
    severity: 'MANAGEABLE' | 'CHALLENGING' | 'DIFFICULT' | 'EXTREME';
    forUserType: string;
    adaptation: string;
  }>;
  
  // 人性化建议
  humanTips: Array<{
    tip: string;
    timing: string;
    reason: string;
  }>;
}
```

---

## 输入/输出 Schema

### 输入：ExperienceAgentInput

```typescript
{
  request_id: string;
  
  // 查询类型
  query_type: 'DENSITY_ANALYSIS' | 'PACE_OPTIMIZATION' | 'FATIGUE_PREDICTION' | 'EXECUTABILITY_CHECK';
  
  // 行程
  itinerary: Itinerary;
  
  // 用户画像
  user_profile: {
    fitnessLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    travelStyle: 'RELAXED' | 'MODERATE' | 'INTENSIVE';
    ageGroup?: string;
    specialNeeds?: string[];
  };
  
  // 偏好
  preferences?: {
    experiencePriority: 'SCENIC' | 'CULTURAL' | 'ADVENTURE' | 'MIXED';
    pacePriority: 'SLOW' | 'BALANCED' | 'FAST';
    fatigueTolerancex: 'LOW' | 'MEDIUM' | 'HIGH';
  };
}
```

### 输出：ExperienceAgentOutput

```typescript
{
  request_id: string;
  
  // 体验密度
  density_analysis?: ExperienceDensityAnalysis;
  
  // 节奏优化
  pace_optimization?: PaceOptimization;
  
  // 疲劳预测
  fatigue_prediction?: FatiguePrediction;
  
  // 人体可执行性
  human_executability?: HumanExecutability;
  
  // 体验评分
  experience_score: {
    overall: number;                     // 0..10
    forUserType: string;
    confidence: number;
  };
  
  // 关键警告
  warnings: Array<{
    warningType: 'PACE' | 'FATIGUE' | 'EXECUTABILITY' | 'EXPERIENCE_GAP';
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    message: string;
    suggestion: string;
  }>;
  
  // 证据
  evidence: EvidenceRef[];
}
```

---

## 与约束系统的关系

ExperienceAgent 输出主要影响 **Soft Constraints** 和 **权衡模型**：

| 体验状况 | 约束类型 | 处理方式 |
|----------|----------|----------|
| 疲劳超限 | HARD | 人体极限，需调整 |
| 节奏过快 | SOFT | 提示风险，用户决定 |
| 体验密度低 | SOFT | 提供增强建议 |
| 体验与效率冲突 | SOFT | 纳入权衡 |

---

## 数据来源

- 行程数据分析
- 用户画像
- 历史疲劳数据
- POI 体验时长数据
- 用户反馈数据

---

## 与其他 Agent 的协作

| 协作 Agent | 协作方式 |
|------------|----------|
| **Gatekeeper** | 疲劳超限触发门控 |
| **CoreDecision** | 提供体验维度评分 |
| **GeoAgent** | 地形难度影响疲劳 |
| **LocalInsight** | 体验增强的替代建议 |

---

## Dr.Dre 节奏感体现

ExperienceAgent 是 Dr.Dre 人格的核心数据提供者：

- **节奏感**：分析行程的"呼吸感"
- **体感导向**：关注人的感受，而非数字优化
- **动态调整**：根据累计疲劳动态调整后续节奏

---

## Claude 快捷唤起

```
作为 TripNARA 的 ExperienceAgent，请分析：
[行程]
[用户画像]

要求：
1. 分析体验密度分布
2. 评估节奏是否合理
3. 预测疲劳曲线
4. 检查人体可执行性
5. 提供节奏优化建议
6. 识别体验空白点
```
