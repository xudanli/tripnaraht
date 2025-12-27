# Dr.Dre Rhythm Brain（节奏脑子）

## 概述

Dr.Dre 已装上真正的"节奏脑子"，能够智能地拆天和插入缓冲日，而不仅仅是"发现问题但不会拆"。

## Dr.Dre 的职责再精确定义

**目标不是更轻松，而是"整体可持续"。**

Dr.Dre 在整套系统里的位置：
- **Abu：** 能不能走
- **Dr.Dre：** 这样走下去几天后会不会崩
- **Neptune：** 世界变了还能不能保持路线精神

**约束：**
- ❌ 不允许突破 Abu 的硬约束
- ❌ 不改 RouteDirection（大方向与哲学）
- ✔ 只在 "每天怎么排" / "是否插休息日" 上动手脚

## 节奏量化结构

### DayProfile（每天的节奏画像）

```typescript
interface DayProfile {
  dayIndex: number;
  segments: RouteSegment[];
  totalDistanceKm: number;
  totalAscentM: number;
  maxSlopePct: number;
  estMovingHours: number;
  fatigueIndex: number;  // 综合指标
}
```

### PaceConstraints（节奏约束）

```typescript
interface PaceConstraints {
  maxDailyAscentM: number;
  maxDailyDistanceKm: number;
  maxMovingHours: number;
  rollingAscent3DaysM: number;
}
```

**来源：**
- `DecisionParams`：由用户画像映射而来
- `RouteDirection.softConstraints`：比如 maxDailyAscentM, bufferTimeMin

### FatigueIndex（疲劳指数）

**计算函数：**

```typescript
function computeFatigueIndex(day: DayProfile, pace: PaceConstraints): number {
  const ascentRatio = day.totalAscentM / pace.maxDailyAscentM;  // >1 = 超标
  const distRatio = day.totalDistanceKm / pace.maxDailyDistanceKm;
  const hoursRatio = day.estMovingHours / pace.maxMovingHours;

  // 惩罚偏"硬"的那一项
  const base = Math.max(ascentRatio, distRatio, hoursRatio);

  // 细调：坡度高再加一点
  const slopePenalty = day.maxSlopePct > 20 ? 0.1 : 0;

  return base + slopePenalty;
}
```

**经验区间：**
- `fatigueIndex <= 0.8`：很轻松
- `0.8 < fatigueIndex <= 1.1`：合理
- `1.1 < fatigueIndex <= 1.4`：偏紧张（建议优化）
- `> 1.4`：高负荷（Dr.Dre 必须出手）

## Dr.Dre 的"节奏管控三件事"

### 1️⃣ 单日超载（Day Overload）

某天 `fatigueIndex` 明显超标
→ 优先考虑 **拆天**

### 2️⃣ 连续疲劳（Rolling Fatigue）

任意 3 天窗口 Σ ascent > `rollingAscent3DaysM`
→ 考虑 **插缓冲日**

### 3️⃣ 不均匀（One Bad Day）

总体 OK，但有一两天特别离谱
→ 拆那天，拉平峰值

## Dr.Dre 的两个主要"动作"

### 动作 A：拆天（Split Day）

**适用：**
- 某一天太重，但前后天还可以承载一点
- 用户不想增加总天数太多
- RouteDirection 不要求"必须住在某个固定点"

**怎么拆？**
- 把一天里的 segments 拆成两天
- 遍历所有可能的拆分点
- 选择：两边都 <= 1.1 或 max(两边 fatigueIndex) 最小的那个

**接口：**

```typescript
interface SplitOperation {
  type: "SPLIT_DAY";
  dayIndex: number;
  splitAfterSegmentIndex: number;
}
```

### 动作 B：插入缓冲日（Insert Buffer/Rest Day）

**适用：**
- 连续 3 天窗口疲劳超标
- RouteDirection 对"多一天"容忍度高

**缓冲日可以是：**
- 纯"低活动日"：短距离 + 低爬升
- 或真·rest day：只有城镇/温泉/观景点

**接口：**

```typescript
interface BufferDayOperation {
  type: "INSERT_BUFFER_DAY";
  insertAfterDayIndex: number;
  template?: "REST" | "LIGHT_WALK" | "LOCAL_EXPLORE";
}
```

## Dr.Dre v2 算法主流程

### 步骤概览：

1. **生成 DayProfile 数组**
2. **标记问题天：** overloadedDays / rollingFatigueWindows
3. **根据用户画像和 RD 决策：** 先拆天还是先插休息
4. **应用一轮调整**（不要无限循环）
5. **重新计算，写入 DecisionLog**

### 核心方法：

- `buildPaceConstraints()` - 构建节奏约束
- `buildDayProfiles()` - 构建每日画像
- `detectRollingFatigue()` - 检测滚动疲劳
- `planSplitDay()` - 规划拆天操作
- `planBufferDay()` - 规划缓冲日操作
- `applySplit()` - 应用拆天
- `applyBuffer()` - 应用缓冲日

## 文件结构

```
src/trips/decision/
├── interfaces/
│   ├── day-profile.interface.ts          # DayProfile 和 PaceConstraints
│   └── dr-dre-operation.interface.ts    # SplitOperation 和 BufferDayOperation
├── services/
│   └── fatigue-calculator.service.ts     # 疲劳指数计算服务
└── strategies/
    └── dr-dre-strategy.service.ts        # Dr.Dre v2 实现
```

## 系统价值

增强后的 Dr.Dre：

**不再只是"发现问题"**

而是会用 **拆天 + 缓冲日**

在 **不违背 RouteDirection 和 Abu 法律** 的前提下，

把一条"理论上能走但会很累的路"，

修成"人类真正在世界上走得完的路"。

## 相关文档

- [Strategy Contract System](./STRATEGY_CONTRACT_SYSTEM.md)
- [Decision Log System](./DECISION_LOG_SYSTEM.md)

