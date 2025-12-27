# 🌪️ WeatherDecisionEvidence（天气决策证据）

## 概述

天气决策证据系统是 Agent 和普通行程规划器的断代差距。这是实时【天气 × DEM × 重规划 Agent】的核心组件。

## 强制规则

1. ❌ **没有 WeatherEvidence 的 segment 不允许 finalize**
2. ❌ **风速 > 15 m/s → 禁止侧风路段**
3. ❌ **能去 ≠ 应该去**

## 数据结构

### WeatherDecisionEvidence

```typescript
{
  segmentId: string;
  date: string;
  windSpeed: number;        // m/s
  windDirection: number;    // 度
  precipitation: number;    // mm
  visibility: number;       // km
  temperatureDrop: number;  // °C
  crosswindRisk: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  violation: 'HARD' | 'SOFT' | 'NONE';
  explanation: string;
  suggestedAction?: 'DELAY' | 'REROUTE' | 'CANCEL' | 'PROCEED';
}
```

## 联合决策链

```
User Intent
  ↓
RouteDirection Candidate
  ↓
DEM Decision Evidence
  ↓
Weather Decision Evidence  ← 你在这里
  ↓
Road / Legal Check
  ↓
Persona Tolerance Gate
  ↓
Plan or Reject
```

**关键点**: Reject 是合法输出

「我不会带你走这条路，因为这不是一个'负责任的世界'。」

## 自动重规划能力

当路线被拦截时：

```typescript
FallbackStrategy {
  keepRegion: true,        // 保持区域
  downgradeRisk: true,      // 降低风险
  preserveScenery: true,    // 保留风景
  addBufferDay: true        // 添加缓冲日
}
```

用户感知：**"Agent 没失败，而是更像一个懂行的向导。"**

## 使用示例

```typescript
import { WeatherDecisionEvidenceService } from './services/weather-decision-evidence.service';

const weatherService = new WeatherDecisionEvidenceService();

const evidence = await weatherService.generateEvidencePipeline(plan, {
  maxWindSpeed: 15,
  maxCrosswindSpeed: 12,
  maxPrecipitation: 50,
  minVisibility: 1,
});

if (evidence.hasHardViolation) {
  // 必须拒绝或重规划
}
```

## 实现细节

参见 `src/trips/decision/services/weather-decision-evidence.service.ts`

