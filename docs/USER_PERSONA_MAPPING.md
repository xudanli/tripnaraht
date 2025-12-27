# 用户画像 → 决策参数映射

## 概述

**PART 3: 用户画像 → 决策参数（Agent 的灵魂）**

你现在终于可以把"用户偏好"变成 物理世界规则。

## 映射规则

| 用户说的 | 系统实际改了什么 |
|---------|----------------|
| 我节奏慢 | rollingAscent 阈值 ↓ |
| 我怕风险 | weatherRiskWeight ↑ |
| 我爱摄影 | 日出日落窗口权重 ↑ |
| 我想轻松 | maxSlopeTolerance ↓ |

## DecisionParams 结构

```typescript
{
  maxDailyAscentM: number;              // 最大每日爬升（米）
  rollingAscent3DaysThreshold: number;  // 3天滚动累计爬升阈值（米）
  weatherRiskWeight: number;            // 天气风险权重（0-1）
  maxSlopeTolerance: number;            // 坡度容忍度（百分比）
  bufferDayBias: number;                // 缓冲日偏好（0-1）
  sunriseSunsetWindowWeight: number;    // 日出日落窗口权重（0-1）
  corridorQualityWeight: number;        // 走廊质量权重（0-1）
}
```

## 映射示例

### 节奏慢 → 物理规则

```typescript
if (pace === 'relaxed') {
  maxDailyAscentM *= 0.7;              // 降低 30%
  rollingAscent3DaysThreshold *= 0.8;  // 降低 20%
  bufferDayBias = 0.6;                 // 增加缓冲日偏好
  maxSlopeTolerance *= 0.8;            // 降低坡度容忍度
}
```

### 怕风险 → 物理规则

```typescript
if (riskTolerance === 'low') {
  weatherRiskWeight = 0.8;             // 提高天气风险权重
  maxSlopeTolerance *= 0.7;           // 降低坡度容忍度
  bufferDayBias = 0.7;                // 增加缓冲日偏好
}
```

### 爱摄影 → 物理规则

```typescript
if (interests.includes('摄影')) {
  sunriseSunsetWindowWeight = 0.7;    // 提高日出日落窗口权重
  corridorQualityWeight = 0.8;        // 提高走廊质量权重（观景）
}
```

## 核心价值

👉 **用户在"填感受"**  
👉 **你在"修改世界物理规则"**

## 实现细节

参见 `src/trips/decision/interfaces/user-persona-mapping.interface.ts`

