# Decision Log System（决策日志系统）

## 概述

**PART A: Decision Log（系统级"责任账本"）**

这是 TripNARA 与所有 LLM/OTA 的根本差异——你不只是给结果，你给"谁在什么依据下做了什么决定"。

## 核心结构

### EnhancedDecisionLog

```typescript
{
  logId: string;
  tripId?: string;
  step: "ROUTE_DIRECTION" | "PLAN_GENERATION" | "PLAN_REPAIR" | "FINALIZE" | "REJECT";
  persona: "ABU" | "DR_DRE" | "NEPTUNE";
  timestamp: ISODatetime;

  inputSnapshot: {
    userIntent: { ... },
    country: string,
    month: number,
    riskTolerance: "low" | "medium" | "high"
  };

  evidence: {
    dem?: DemDecisionEvidence[],
    weather?: WeatherEvidence,
    compliance?: ComplianceEvidence
  };

  decision: {
    action: "ALLOW" | "REJECT" | "ADJUST" | "REPLACE",
    target?: string, // segmentId / poiId / dayIndex
    reasonCodes: string[],
    explanation: string,
    suggestedAlternatives?: string[]
  };

  reasonCodes: string[];
  explanation: string;
}
```

## 三人格的日志风格

### 🧠 Abu · Log 示例

```json
{
  "persona": "ABU",
  "action": "REJECT",
  "reasonCodes": ["RAPID_ASCENT", "ROLLING_FATIGUE"],
  "explanation": "第 3–5 天累计爬升 3100m，超过连续疲劳阈值。路线存在高风险，不允许继续。"
}
```

**关键词**: 冷静、法律化、不可谈判

**用户解释**:
> 我们没有选择这条路线，因为在第 3–5 天会出现连续高强度爬升，这在当前季节和你的节奏偏好下存在明显风险。我们不会赌这件事。

### 🧠 Dr.Dre · Log 示例

```json
{
  "persona": "DR_DRE",
  "action": "ADJUST",
  "target": "DAY_4",
  "explanation": "将第 4 天拆分为两天，并在第 5 天前插入缓冲日以恢复体力。"
}
```

**关键词**: 工程感、结构修复

**用户解释**:
> 这条路线是可行的，但原本的节奏会让你在中段明显疲劳。我们已经帮你把关键一天拆开，并插入了一个缓冲日，让体验更稳定。

### 🧠 Neptune · Log 示例

```json
{
  "persona": "NEPTUNE",
  "action": "REPLACE",
  "target": "ENTRY_POINT",
  "explanation": "原入口受天气影响不可达，已替换为同一走廊内的备用入口，路线哲学保持不变。"
}
```

**关键词**: 空间、连续性、体验

**用户解释**:
> 路线本身没有问题，只是原计划的入口在你到达时不可用。我们为你换了一个入口，你走的仍然是同一条路线。

## 用户感知

**关键点**: 用户感受到的是：
> "不是你不行，是世界不允许这样走。"

这就是高端感。

## 实现细节

参见：
- `src/trips/decision/interfaces/decision-log-enhanced.interface.ts`
- `src/trips/decision/services/persona-explanation.service.ts`

