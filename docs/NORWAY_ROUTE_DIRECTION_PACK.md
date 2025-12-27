# 🇳🇴 Norway RouteDirection Pack (Production Ready)

## 概述

挪威 RouteDirection Pack 是 TripNARA 路线引擎的第二个**生产级国家包**。挪威是「DEM × 海岸 × 气候 × 路线哲学」同时成立的国家，这是 RouteDirection 引擎的天然试金石。

**核心价值：**
- 如果你的系统能把挪威跑顺，世界 80% 的目的地都会显得简单
- 海岸 × DEM 联合决策
- 天气作为第一变量
- 连续疲劳否决
- 同国 4 种完全不同路线哲学

## RouteDirection 列表

### RD-NO-01: Fjord Spine Traverse
**峡湾脊线纵贯（海 → 山脊）**

- **类型**: HIKING
- **最佳月份**: 6, 7, 8, 9
- **避免月份**: 11, 12, 1, 2, 3
- **典型时长**: 8 天
- **标签**: 徒步, 峡湾, 摄影, 自然

**核心约束：**
- 硬约束: `maxDailyRapidAscentM: 1100`, `rapidAscentForbidden: false`
- 软约束: `maxElevationM: 1800`, `maxDailyAscentM: 1200`, `maxSlopePct: 28`, `bufferTimeMin: 120`

**DEM 决策点：**
- `rollingAscent3DaysThreshold: 2800` → 连续日爬升极强，rollingAscent 是核心否决点
- `slopeStability: MEDIUM` → 单日坡度不极端，但连续日爬升极强
- `weatherBufferRequired: true` → Dr.Dre 高频插入「天气缓冲日」

**哲学**: "每一天都从水面抬升到空中，用高度理解峡湾。"

**失败画像：**
- 常见失败日期: [2, 3]
- 典型失败原因: ['weather', 'fatigue']
- 救援难度: MEDIUM

**不适合的用户：**
- 不接受天气变化
- 不愿意临时调整计划
- 低风险容忍

---

### RD-NO-02: Lofoten Arctic Coastline
**罗弗敦北极海岸光线路线**

- **类型**: SCENIC_DRIVE
- **最佳月份**: 2, 3, 9, 10（极光季节和光线最佳月份）
- **避免月份**: 11, 12, 1, 4, 5, 6, 7, 8
- **典型时长**: 6 天
- **标签**: 摄影, 海岸, 极光, 慢旅行

**核心约束：**
- 硬约束: `maxElevationM: 900`
- 软约束: `bufferTimeMin: 90`

**DEM 决策点：**
- `demFriendly: true` → DEM 很友好
- `weatherFirstPriority: true` → 天气与光线是第一决策变量
- `climateOverDem: true` → 这是气候 > DEM 的经典 RD

**哲学**: "这是一条追逐光线与风的路线，而不是距离。"

**失败画像：**
- 常见失败日期: []
- 典型失败原因: ['weather']
- 救援难度: LOW

**不适合的用户：**
- 讨厌自驾
- 不接受天气等待

**备注**: 这是气候 > DEM 的经典 RD。DEM 很友好，但天气与光线是第一决策变量。

---

### RD-NO-03: Jotunheimen High Plateau
**尤通海门高原山屋纵走**

- **类型**: HIKING
- **最佳月份**: 7, 8, 9
- **避免月份**: 11, 12, 1, 2, 3, 4, 5, 6, 10
- **典型时长**: 7 天
- **标签**: 徒步, 高原, 挑战

**核心约束：**
- 硬约束: `maxElevationM: 2500`, `rapidAscentForbidden: true`
- 软约束: `maxDailyAscentM: 1000`, `maxSlopePct: 25`, `bufferTimeMin: 120`

**DEM 决策点：**
- `lowAltitudeHighConsumption: true` → "低海拔但高消耗"的 DEM 反直觉样本
- `fatigueModelTraining: true` → 非常适合训练引擎的疲劳模型
- `continuousFatigue: true` → 连续性疲劳是关键

**哲学**: "这是用连续性而不是高度来制造疲劳的路线。"

**失败画像：**
- 常见失败日期: [3]
- 典型失败原因: ['fatigue']
- 救援难度: MEDIUM

**不适合的用户：**
- 体能不足
- 不愿背包
- 追求舒适

**备注**: 这是**"低海拔但高消耗"**的 DEM 反直觉样本，非常适合训练引擎的疲劳模型。

---

### RD-NO-04: Norwegian Scenic Routes
**挪威国家风景公路恢复路线**

- **类型**: SCENIC_DRIVE
- **最佳月份**: 5, 6, 7, 8, 9
- **避免月份**: 11, 12, 1, 2, 3
- **典型时长**: 5 天
- **标签**: 自驾, 风景, 慢节奏

**核心约束：**
- 硬约束: {}
- 软约束: `bufferTimeMin: 45`

**哲学**: "这是为恢复和观察而存在的路线。"

**失败画像：**
- 常见失败日期: []
- 典型失败原因: []
- 救援难度: LOW

---

## 系统价值

### 1. 海岸 × DEM 联合决策 ✅
- **RD-NO-01**: 从海面到山脊的连续爬升，需要同时考虑海岸线和 DEM
- **RD-NO-02**: 海岸线为主，DEM 友好但天气优先
- **RD-NO-03**: 高原 DEM，连续性疲劳
- **RD-NO-04**: 风景公路，低 DEM 需求

### 2. 天气作为第一变量 ✅
- **RD-NO-01**: 天气缓冲日频繁插入
- **RD-NO-02**: 天气与光线是第一决策变量（气候 > DEM）
- **RD-NO-03**: 高原天气窗口限制
- **RD-NO-04**: 天气影响较小

### 3. 连续疲劳否决 ✅
- **RD-NO-01**: `rollingAscent3DaysThreshold: 2800` → 连续日爬升极强
- **RD-NO-03**: 连续性疲劳是关键（低海拔但高消耗）

### 4. 同国 4 种完全不同路线哲学 ✅
- **RD-NO-01**: 中等强度徒步 + 峡湾摄影
- **RD-NO-02**: 极低强度自驾 + 光线追逐（气候优先）
- **RD-NO-03**: 高强度挑战 + 连续性疲劳（反直觉 DEM）
- **RD-NO-04**: 恢复型风景公路

## 关键决策场景

### 场景 1: 海岸 × DEM 联合决策
**RD-NO-01** 展示了如何同时考虑：
- 海岸线的可达性
- 从海面到山脊的 DEM 爬升
- 天气对海岸和山脊的不同影响

### 场景 2: 气候 > DEM
**RD-NO-02** 展示了：
- DEM 很友好（maxElevationM: 900）
- 但天气与光线是第一决策变量
- 需要等待天气窗口

### 场景 3: 连续疲劳否决
**RD-NO-01** 和 **RD-NO-03** 展示了：
- 单日坡度不极端，但连续日爬升极强
- `rollingAscent3DaysThreshold` 是核心否决点
- Dr.Dre 需要高频插入天气缓冲日

### 场景 4: 反直觉 DEM
**RD-NO-03** 展示了：
- "低海拔但高消耗"的 DEM 反直觉样本
- 用连续性而不是高度来制造疲劳
- 非常适合训练引擎的疲劳模型

## 使用方法

### Seed 到数据库

```bash
npx ts-node --project tsconfig.backend.json scripts/seed-norway-route-directions.ts
```

### 验证数据

```typescript
const rds = await prisma.routeDirection.findMany({
  where: { countryCode: 'NO' },
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

## 与其他国家 Pack 的对比

| 能力 | 瑞士 | 挪威 |
|------|------|------|
| 高 DEM 复杂度 | ✅ | ✅ |
| 海岸 × DEM 联合决策 | ❌ | ✅ |
| 天气作为第一变量 | ⚠️ | ✅ |
| 连续疲劳否决 | ✅ | ✅ |
| 同国 4 种路线哲学 | ✅ | ✅ |

## 后续扩展

1. **添加更多 POI**: 为每个 RouteDirection 添加真实的挪威 POI 数据
2. **细化天气决策模型**: 根据实际使用情况调整天气窗口和光线条件
3. **添加 RouteTemplate**: 为每个 RouteDirection 创建具体的路线模板
4. **性能监控**: 跟踪每个 RouteDirection 的成功率和失败原因
5. **疲劳模型训练**: 使用 RD-NO-03 训练和改进疲劳检测模型

## 相关文档

- [Switzerland RouteDirection Pack](./SWITZERLAND_ROUTE_DIRECTION_PACK.md)
- [RouteDirection Engine Technical Whitepaper](./ROUTE_DIRECTION_ENGINE_WHITEPAPER.md)
- [Country Pack Design Manual](./COUNTRY_PACK_GUIDE.md)
- [DEM Decision Evidence](./DEM_DECISION_EVIDENCE.md)

