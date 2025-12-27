# 🇨🇭 Switzerland RouteDirection Pack (Production Ready)

## 概述

瑞士 RouteDirection Pack 是 TripNARA 路线引擎的第一个**生产级国家包**。这不是示例或说明文档，而是可以直接 seed 到系统、让 RouteDirection 引擎立即"变强"的真实数据。

**核心价值：**
- 在极高 DEM 复杂度下，维持极低失败率
- 一个"纪律极强"的国家，非常适合作为路线引擎的标杆样本
- 同一国家 4 种完全不同的旅行人格
- 高 DEM ≠ 高风险 的真实对比样本
- Abu / Dr.Dre / Neptune 的"教科书级分工场景"

## RouteDirection 列表

### RD-CH-01: Alpine Panorama Traverse
**阿尔卑斯全景纵贯（湖泊 × 山脊 × 铁路）**

- **类型**: HIKING
- **最佳月份**: 6, 7, 8, 9
- **避免月份**: 11, 12, 1, 2, 3
- **典型时长**: 7 天
- **标签**: 徒步, 摄影, 自然, 湖泊, 高山

**核心约束：**
- 硬约束: `maxDailyRapidAscentM: 1000`, `rapidAscentForbidden: false`
- 软约束: `maxElevationM: 3000`, `maxDailyAscentM: 1100`, `maxSlopePct: 25`

**DEM 决策点：**
- `rollingAscent3DaysThreshold: 2600` → 3天累计爬升 > 2600m → 强制 Dr.Dre 拆天
- `slopeStability: HIGH` → 高山湖泊区 slope 波动小 → 稳定 corridor

**哲学**: "每天的攀升都是为了视野，而不是为了完成距离。"

**失败画像：**
- 常见失败日期: [3, 4]
- 典型失败原因: ['fatigue', 'weather']
- 救援难度: LOW

**不适合的用户：**
- 时间极度紧张
- 拒绝徒步
- 只想城市打卡

---

### RD-CH-02: Glacier Express Corridor
**冰川快车慢旅行轴线**

- **类型**: RAIL
- **最佳月份**: 5, 6, 7, 8, 9, 10
- **避免月份**: 11, 12, 1, 2, 3
- **典型时长**: 5 天
- **标签**: 铁路, 摄影, 风景, 慢旅行

**核心约束：**
- 硬约束: `maxElevationM: 2900`
- 软约束: `bufferTimeMin: 60`

**DEM 决策点：**
- `failureRate: VERY_LOW` → 极低失败率 RD，是 Abu 的"安全锚点"

**哲学**: "不是移动你的位置，而是展开你的视野。"

**失败画像：**
- 常见失败日期: []
- 典型失败原因: []
- 救援难度: LOW

**不适合的用户：**
- 追求强体能挑战
- 讨厌铁路

---

### RD-CH-03: High Alpine Pass Challenge
**高阿尔卑斯山口挑战（山屋接力）**

- **类型**: HIKING
- **最佳月份**: 7, 8, 9
- **避免月份**: 11, 12, 1, 2, 3, 4, 5, 6
- **典型时长**: 6 天
- **标签**: 徒步, 挑战, 高山, 山口

**核心约束：**
- 硬约束: `maxDailyRapidAscentM: 1200`, `maxElevationM: 3600`, `rapidAscentForbidden: true`
- 软约束: `maxDailyAscentM: 1400`, `maxSlopePct: 30`, `bufferTimeMin: 120`

**DEM 决策点：**
- `rollingAscent3DaysThreshold: 3000` → 更严格的阈值
- `neptuneRepairStrategy: SWITCH_PASS` → Neptune 常用修复：换山口，而不是降难度
- `demIsAbsoluteJudge: true` → DEM 是绝对裁判

**哲学**: "每天都在山口结束，因为山口是理解地形的方式。"

**失败画像：**
- 常见失败日期: [2, 3]
- 典型失败原因: ['fatigue', 'weather', 'altitude']
- 救援难度: MEDIUM

**不适合的用户：**
- 低体能
- 低风险容忍
- 不愿拆天

**备注**: 这是瑞士最"像尼泊尔"的路线，DEM 是绝对裁判。

---

### RD-CH-04: Swiss Cities & Lakes Recovery
**瑞士城市与湖泊恢复路线**

- **类型**: URBAN_SCENIC
- **最佳月份**: 4, 5, 6, 9, 10
- **避免月份**: 11, 12, 1, 2, 3
- **典型时长**: 4 天
- **标签**: 城市, 湖泊, 慢节奏

**核心约束：**
- 硬约束: {}
- 软约束: `bufferTimeMin: 30`

**哲学**: "这是为恢复而存在的路线，不是挑战。"

**失败画像：**
- 常见失败日期: []
- 典型失败原因: []
- 救援难度: LOW

---

## 系统价值

### 1. 同一国家 4 种旅行人格
- **RD-CH-01**: 中等强度徒步 + 摄影
- **RD-CH-02**: 极低强度铁路观光
- **RD-CH-03**: 高强度挑战（类似尼泊尔）
- **RD-CH-04**: 恢复型城市游览

### 2. 高 DEM ≠ 高风险 的真实对比样本
- **RD-CH-01**: 高 DEM，低风险（稳定 corridor）
- **RD-CH-02**: 中等 DEM，极低风险（铁路）
- **RD-CH-03**: 极高 DEM，中等风险（挑战路线）
- **RD-CH-04**: 低 DEM，极低风险（城市）

### 3. Abu / Dr.Dre / Neptune 的"教科书级分工场景"
- **Abu (活动选择)**: RD-CH-02 作为"安全锚点"
- **Dr.Dre (日程安排)**: RD-CH-01 和 RD-CH-03 的拆天逻辑
- **Neptune (计划修复)**: RD-CH-03 的"换山口"策略

### 4. 可反复复用的"安全国家模板"
瑞士 Pack 展示了如何在复杂地形下维持低失败率，可以作为其他高 DEM 国家的参考模板。

## 使用方法

### Seed 到数据库

```bash
npx ts-node --project tsconfig.backend.json scripts/seed-switzerland-route-directions.ts
```

### 验证数据

```typescript
const rds = await prisma.routeDirection.findMany({
  where: { countryCode: 'CH' },
  include: { /* ... */ }
});
```

## 技术细节

### PostGIS 几何数据
每个 RouteDirection 都包含 `corridorGeom` 字段（PostGIS geography 类型），使用 `ST_GeogFromText` 函数插入。

### 数据结构
- `constraints`: 包含 `hardConstraints` 和 `softConstraints`
- `metadata`: 包含 `routeType`, `philosophy`, `demDecisionPoints`, `antiPersona`, `failureProfile`
- `signaturePois`: 包含 POI 列表和类型
- `itinerarySkeleton`: 包含 `dayThemes`, `dailyPace`, `objectiveWeights`

## 后续扩展

1. **添加更多 POI**: 为每个 RouteDirection 添加真实的 POI 数据
2. **细化 DEM 决策点**: 根据实际使用情况调整阈值
3. **添加 RouteTemplate**: 为每个 RouteDirection 创建具体的路线模板
4. **性能监控**: 跟踪每个 RouteDirection 的成功率和失败原因

## 相关文档

- [RouteDirection Engine Technical Whitepaper](./ROUTE_DIRECTION_ENGINE_WHITEPAPER.md)
- [Country Pack Design Manual](./COUNTRY_PACK_GUIDE.md)
- [DEM Decision Evidence](./DEM_DECISION_EVIDENCE.md)

