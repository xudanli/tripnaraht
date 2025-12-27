# 决策体检面板系统

## 概述

决策体检面板是 TripNARA 的核心可观测性工具，用于量化、分析和优化决策质量。

## 核心功能

### 1. 决策统计视图

**目标**：回答两个问题：
1. TripNARA 的决策，有多少是"硬现实驱动"（PHYSICAL + HUMAN 比例）？
2. 不同国家/路线，决策源分布有什么差异？

**服务**：`DecisionStatsService`

**主要方法**：
- `getStatsByCountry()`: 按国家统计决策分布
- `getStatsByRouteDirection()`: 按路线方向统计决策分布
- `getPersonaTriggerStats()`: 按 Persona 统计触发频次和源头
- `getRealityDrivenRatio()`: 获取硬现实驱动比例
- `getHeuristicHotspots()`: 获取 HEURISTIC 决策热点

**使用示例**：

```typescript
// 获取冰岛决策统计
const stats = await decisionStats.getStatsByCountry('IS');
console.log(`硬现实驱动比例: ${(stats.realityDrivenRatio * 100).toFixed(1)}%`);

// 获取 Persona 触发统计
const personaStats = await decisionStats.getPersonaTriggerStats();
console.log(`Abu 触发: ${personaStats.find(p => p.persona === 'ABU')?.triggerCount} 次`);
```

### 2. HEURISTIC 减肥计划

**目标**：将 HEURISTIC 决策逐步转换为 PHYSICAL / HUMAN / PHILOSOPHY 决策。

**服务**：`HeuristicDietService`

**主要方法**：
- `generateDietPlan()`: 生成 HEURISTIC 减肥计划
- `getConversionGuidelines()`: 获取转换指南

**使用示例**：

```typescript
// 生成减肥计划
const dietPlan = await heuristicDietService.generateDietPlan();
console.log(`当前 HEURISTIC 占比: ${(dietPlan.heuristicRatio * 100).toFixed(1)}%`);
console.log(`预计转换后占比: ${(dietPlan.estimatedHeuristicRatioAfterConversion * 100).toFixed(1)}%`);

// 查看转换目标
dietPlan.conversionTargets.forEach(target => {
  console.log(`场景: ${target.scenario}`);
  console.log(`优先级: ${target.priority}/10`);
  console.log(`需要补充数据: ${target.conversionPlan.requiredData.join(', ')}`);
});
```

### 3. 用户反馈闭环

**目标**：将用户旅程反馈映射到 HumanCapabilityModel 微调。

**服务**：`TripFeedbackService`

**主要方法**：
- `analyzeFeedback()`: 分析旅程反馈并生成微调建议
- `applyAdjustments()`: 应用调整到 HumanCapabilityModel
- `calculateRealityAlignmentScore()`: 计算 REALITY_ALIGNMENT_SCORE

**使用示例**：

```typescript
// 分析反馈
const feedback: TripFeedback = {
  tripId: 'trip_123',
  userId: 'user_456',
  feedbackAt: new Date(),
  overallIntensity: 'TOO_TIRED',
  altitudeDiscomfort: 'MILD',
  mostTiredDay: 4,
};

const analysis = await tripFeedbackService.analyzeFeedback(feedback, decisionLogs);
console.log(`需要调整: ${analysis.needsAdjustment}`);
console.log(`调整建议: ${analysis.adjustments.length} 项`);

// 计算 REALITY_ALIGNMENT_SCORE
const score = tripFeedbackService.calculateRealityAlignmentScore(decisionLogs, feedback);
console.log(`现实对齐分数: ${(score * 100).toFixed(1)}%`);
```

## 可视化维度

### 按国家

**问题**：冰岛/尼泊尔/西藏 哪个更靠 PHYSICAL？

**答案**：通过 `getStatsByCountry()` 获取每个国家的决策分布，比较 PHYSICAL 占比。

### 按 Persona

**问题**：Abu/Dr.Dre/Neptune 触发频次 & 源头？

**答案**：通过 `getPersonaTriggerStats()` 获取每个 Persona 的触发统计和主要决策来源。

## Killer 句式

> "我们 X% 的关键决策来自物理现实建模，而不是启发式。"

**计算方式**：
```typescript
const ratio = await decisionStats.getRealityDrivenRatio('IS');
console.log(`我们 ${(ratio * 100).toFixed(1)}% 的关键决策来自物理现实建模，而不是启发式。`);
```

## 监控脚本

### 冰岛 E2E 监控

**命令**：`npm run monitor:iceland-e2e`

**功能**：
- 统计最近 N 次冰岛高地 trip 的决策指标
- 输出 Markdown 报告

**指标**：
- Abu 拒绝率
- Dr.Dre 调整率
- Neptune 替换率
- decisionSource 分布
- 硬现实驱动比例

## Demo 命令

### 冰岛高地 E2E Demo

**命令**：`npm run demo:iceland-highlands`

**功能**：
- 构造一个 WorldModelContext（典型 8 月用户画像）
- 跑 decision engine
- 输出简要行程、决策日志、Markdown 报告

**输出**：
- 控制台输出：简要行程和决策日志
- 文件输出：`iceland-highlands-demo-report.md`

## 数据库表结构（建议）

```sql
-- 决策日志表
CREATE TABLE decision_logs (
  id SERIAL PRIMARY KEY,
  trip_id VARCHAR(255),
  country_code VARCHAR(2),
  route_direction_id VARCHAR(255),
  persona VARCHAR(20), -- 'ABU' | 'DR_DRE' | 'NEPTUNE'
  action VARCHAR(20), -- 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE'
  decision_source VARCHAR(20), -- 'PHYSICAL' | 'HUMAN' | 'PHILOSOPHY' | 'HEURISTIC'
  reason_codes TEXT[],
  explanation TEXT,
  timestamp TIMESTAMP DEFAULT NOW(),
  metadata JSONB
);

-- 索引
CREATE INDEX idx_decision_logs_country ON decision_logs(country_code);
CREATE INDEX idx_decision_logs_route ON decision_logs(route_direction_id);
CREATE INDEX idx_decision_logs_source ON decision_logs(decision_source);
CREATE INDEX idx_decision_logs_persona ON decision_logs(persona);
CREATE INDEX idx_decision_logs_timestamp ON decision_logs(timestamp);
```

## 统计查询示例

```sql
-- 按国家统计决策分布
SELECT
  country_code,
  decision_source,
  COUNT(*) AS decision_count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY country_code), 2) AS percentage
FROM decision_logs
WHERE country_code = 'IS'
GROUP BY country_code, decision_source
ORDER BY country_code, decision_count DESC;

-- 按 Persona 统计触发频次
SELECT
  persona,
  decision_source,
  COUNT(*) AS trigger_count
FROM decision_logs
GROUP BY persona, decision_source
ORDER BY persona, trigger_count DESC;

-- 硬现实驱动比例
SELECT
  country_code,
  ROUND(
    COUNT(*) FILTER (WHERE decision_source IN ('PHYSICAL', 'HUMAN')) * 100.0 / COUNT(*),
    2
  ) AS reality_driven_ratio
FROM decision_logs
GROUP BY country_code
ORDER BY reality_driven_ratio DESC;
```

## 未来扩展

1. **决策来源分析 Dashboard**：可视化决策来源分布
2. **决策质量评分**：基于决策来源的权重计算决策质量
3. **学习闭环**：根据决策来源分布调整模型参数
4. **实时监控**：实时展示决策统计和 HEURISTIC 热点

