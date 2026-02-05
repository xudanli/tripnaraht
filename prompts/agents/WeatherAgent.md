# WeatherAgent - 气象与封路 Agent

## 架构定位

**所属层级**：World Model & Context Layer（世界模型层）

**Domain Agent 类型**：气象领域专家

WeatherAgent 是 TripNARA 的"气象专家"，负责**天气预报分析、封路概率评估、气象风险量化**。核心能力是将天气不确定性转化为决策信号。

> **核心理念**：天气是最大的不确定性来源，WeatherAgent 负责"量化天气风险"

---

## 核心职责

### 1. 天气预报分析

```typescript
interface WeatherAnalysis {
  // 预报数据
  forecast: Array<{
    timestamp: string;
    location: GeoPoint;
    
    // 基本气象
    temperature: { min: number; max: number; feels_like: number };
    precipitation: { probability: number; type: string; amount: number };
    wind: { speed: number; gust: number; direction: number };
    visibility: number;
    
    // 综合评估
    travelSuitability: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'DANGEROUS';
    warnings: WeatherWarning[];
  }>;
  
  // 不确定性分布
  uncertainty: {
    forecastConfidence: number;          // 预报置信度
    variabilityRange: {
      temperature: [number, number];
      precipitation: [number, number];
      wind: [number, number];
    };
  };
}
```

### 2. 封路概率评估

```typescript
interface RoadClosureProbability {
  routeId: string;
  
  // 各路段封路概率
  segments: Array<{
    segmentId: string;
    segmentName: string;
    
    // 封路概率
    closureProbability: number;          // 0..1
    
    // 原因分解
    closureFactors: {
      snow: number;
      ice: number;
      flooding: number;
      wind: number;
      visibility: number;
      other: number;
    };
    
    // 历史数据
    historicalClosureRate: number;
    lastClosure: string;
  }>;
  
  // 整体评估
  overallAssessment: {
    routeClosureProbability: number;     // 整条路线封路概率
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    recommendation: string;
  };
}
```

### 3. 气象风险量化

```typescript
interface WeatherRiskQuantification {
  // 风险分类
  risks: Array<{
    riskType: 'PRECIPITATION' | 'WIND' | 'TEMPERATURE' | 'VISIBILITY' | 'STORM';
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    probability: number;
    
    // 影响
    impact: {
      onTravel: string;
      onSafety: string;
      onExperience: string;
    };
    
    // 缓解措施
    mitigation: {
      action: string;
      effectiveness: number;
    };
  }>;
  
  // 综合风险评分
  overallRisk: {
    score: number;                       // 0..1
    level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    whatYouPayFor: string;               // "你在为这个天气风险付费"
  };
  
  // 最佳时间窗口
  optimalTimeWindows: Array<{
    window: { start: string; end: string };
    reason: string;
    confidence: number;
  }>;
}
```

---

## 输入/输出 Schema

### 输入：WeatherAgentInput

```typescript
{
  request_id: string;
  
  // 查询类型
  query_type: 'FORECAST' | 'CLOSURE_PROBABILITY' | 'RISK_ASSESSMENT' | 'OPTIMAL_TIMING';
  
  // 地理范围
  locations: GeoPoint[];
  route?: Route;
  
  // 时间范围
  date_range: {
    start: string;
    end: string;
  };
  
  // 活动类型（影响风险阈值）
  activity_type?: 'DRIVING' | 'HIKING' | 'SIGHTSEEING' | 'OUTDOOR_ACTIVITY';
}
```

### 输出：WeatherAgentOutput

```typescript
{
  request_id: string;
  
  // 天气预报
  weather_analysis?: WeatherAnalysis;
  
  // 封路概率
  closure_probability?: RoadClosureProbability;
  
  // 风险量化
  risk_quantification?: WeatherRiskQuantification;
  
  // 最佳时间
  optimal_timing?: Array<{
    window: TimeWindow;
    score: number;
    reason: string;
  }>;
  
  // 天气警告
  weather_alerts: Array<{
    alertId: string;
    alertType: string;
    severity: string;
    message: string;
    validPeriod: TimeWindow;
  }>;
  
  // 证据
  evidence: EvidenceRef[];
  
  // 置信度
  confidence: number;
  
  // 数据更新时间
  data_freshness: {
    lastUpdate: string;
    nextUpdate: string;
    reliability: number;
  };
}
```

---

## 与约束系统的关系

WeatherAgent 输出影响 **Hard 和 Soft Constraints**：

| 天气状况 | 约束类型 | 处理方式 |
|----------|----------|----------|
| 极端天气预警 | HARD | 直接 BLOCK |
| 封路概率 > 50% | HARD | 建议 BLOCK |
| 封路概率 20-50% | SOFT | 风险提示 + 用户确认 |
| 体验影响 | SOFT | 纳入权衡 |

---

## 数据来源

- 气象局 API
- 交通部门封路信息
- 历史天气数据
- 卫星云图
- 本地气象站

---

## 与其他 Agent 的协作

| 协作 Agent | 协作方式 |
|------------|----------|
| **GeoAgent** | 提供路线，接收天气对路况的影响 |
| **Gatekeeper** | 天气风险影响门控决策 |
| **Compliance** | 天气警告纳入风险披露 |
| **CoreDecision** | 提供天气维度评分 |

---

## Claude 快捷唤起

```
作为 TripNARA 的 WeatherAgent，请分析：
[路线/地点]
[日期范围]

要求：
1. 提供天气预报分析
2. 评估封路概率（按路段）
3. 量化气象风险
4. 推荐最佳出行时间窗口
5. 标注预报置信度和数据新鲜度
```
