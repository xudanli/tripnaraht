# 🇮🇸 Iceland RouteDirection Pack (Production Ready)

## 概述

冰岛 RouteDirection Pack 是 TripNARA 路线引擎的第三个**生产级国家包**。冰岛是世界上最适合把「旅行 Agent」锻造成"世界模型级 Agent"的国家，因为它把 地质、气候、道路、法律、风险 全部压在同一个棋盘上。

**核心价值：**
- 这不是"换一个国家"，这是把 Agent 从「会规划」推到「会判断」
- 在冰岛，Agent 不能只做推荐，必须会"拦截"
- 如果一个 Agent 在冰岛不敢乱说话，它在任何国家都会靠谱

**国家级判定前提：**
- **核心自然特征**: 火山、冰川、峡谷、高纬度气候
- **决策主导**: `WEATHER > ROAD > VEHICLE > PERSONA`
- **不可协商事实**:
  - 天气可在 30 分钟内反转
  - F-road ≠ 普通道路
  - 很多"能去"不等于"该去"

## RouteDirection 列表

### RD-IS-01: Ring Road Conscious Loop
**环岛公路 · 风险可控认知闭环**

- **类型**: SCENIC_DRIVE
- **最佳月份**: 6, 7, 8, 9
- **避免月份**: 11, 12, 1, 2, 3
- **典型时长**: 10 天
- **标签**: 自驾, 自然, 新手友好

**核心约束：**
- 硬约束: `fRoadForbidden: true`, `glacierCrossingForbidden: true`
- 软约束: `maxDailyDriveKm: 300`, `bufferTimeMin: 120`

**DEM 决策点：**
- `isNewbieSafeShell: true` → 这是冰岛的"新手安全壳"
- `isDefaultFallback: true` → 是所有 persona 的默认 fallback
- `drDreRole: PACE_ADJUSTMENT` → Dr.Dre 在此路线中几乎只负责节奏修正

**哲学**: "这是唯一一条让人类理解冰岛，而不是被冰岛教育的路线。"

**失败画像：**
- 常见失败日期: []
- 典型失败原因: ['weather', 'wind']
- 救援难度: LOW

**不适合的用户：**
- 不接受行程调整
- 讨厌长时间驾驶

**决策意义**: 这是冰岛的"新手安全壳"，是所有 persona 的默认 fallback。

---

### RD-IS-02: South Coast Volcanic Axis
**南岸火山轴线（水 × 火）**

- **类型**: SCENIC_DRIVE
- **最佳月份**: 5, 6, 7, 8, 9, 10
- **避免月份**: 11, 12, 1, 2, 3, 4
- **典型时长**: 5 天
- **标签**: 瀑布, 火山, 冰川, 摄影

**核心约束：**
- 硬约束: `windSensitivity: HIGH`, `fRoadForbidden: true`
- 软约束: `bufferTimeMin: 150`

**DEM 决策点：**
- `highCertainty: true` → 确定性极高
- `windFirstPriority: true` → 风是第一优先级
- `decisionDominance: ['WIND > RAIN > SNOW']` → 冰岛核心现实：风 > 雨 > 雪

**哲学**: "这是冰岛唯一一条"确定性极高"的自然展示轴线。"

**失败画像：**
- 常见失败日期: [1]
- 典型失败原因: ['wind']
- 救援难度: LOW

**冰岛核心现实**: 风 > 雨 > 雪。侧风是 Agent 必须显式告知的风险变量。

---

### RD-IS-03: Highlands F-Road Penetration
**内陆高地 F 路穿越**

- **类型**: ADVENTURE_DRIVE
- **最佳月份**: 7, 8（只有 7-8 月可行）
- **避免月份**: 1, 2, 3, 4, 5, 6, 9, 10, 11, 12
- **典型时长**: 4 天
- **标签**: F-road, 荒野, 高风险

**核心约束：**
- 硬约束: 
  - `vehicleRequired: '4x4'` → 必须 4x4 车辆
  - `riverCrossing: true` → 需要河流穿越能力
  - `weatherWindowRequired: true` → 必须天气窗口
  - `fRoadRequired: true` → F-road 必需
- 软约束: `bufferTimeMin: 240` → 4 小时缓冲时间

**DEM 决策点：**
- `isInterceptionCore: true` → 这是冰岛拦截能力的核心样本
- `requiresExplicitRejection: true` → Agent 必须明确拒绝
- `requiresExplicitReason: true` → Agent 必须明确给出理由
- `requiresAlternativeRoute: true` → Agent 必须明确给出替代方案（RD-IS-01 / 02）

**哲学**: "这不是一条路线，这是一张"是否该放你进去"的考卷。"

**失败画像：**
- 常见失败日期: [1]
- 典型失败原因: ['river', 'weather']
- 救援难度: HIGH

**不适合的用户：**
- 第一次来冰岛
- 无越野经验
- 风险容忍低
- 无 4x4 车辆

**拦截能力要求**:
- ❌ 明确拒绝不合适用户
- ❌ 明确给出理由
- ❌ 明确给出替代方案（RD-IS-01 / 02）

---

### RD-IS-04: Laugavegur Trail
**劳加韦古尔火山徒步**

- **类型**: HIKING
- **最佳月份**: 7, 8（只有 7-8 月可行）
- **避免月份**: 1, 2, 3, 4, 5, 6, 9, 10, 11, 12
- **典型时长**: 4 天
- **标签**: 徒步, 火山, 地貌

**核心约束：**
- 硬约束: `weatherWindowRequired: true`, `rapidAscentForbidden: true`
- 软约束: `maxDailyAscentM: 900`, `bufferTimeMin: 180`

**DEM 决策点：**
- `isWorldClassSample: true` → 徒步世界级样本
- `weatherWindowCritical: true` → 天气窗口关键

**哲学**: "这是"地球在施工中"的可步行版本。"

**失败画像：**
- 常见失败日期: []
- 典型失败原因: ['weather']
- 救援难度: MEDIUM

---

## Agent 质变价值

### 1. 天气作为第一决策变量 ✅
- **RD-IS-01**: 天气窗口要求，但风险可控
- **RD-IS-02**: 风是第一优先级（WIND > RAIN > SNOW）
- **RD-IS-03**: 天气窗口是硬性要求
- **RD-IS-04**: 天气窗口关键

### 2. Agent 主动拒绝用户 ✅
- **RD-IS-03** 展示了 Agent 必须：
  - 明确拒绝不合适用户
  - 明确给出理由
  - 明确给出替代方案

### 3. 法律 / 道路规则纳入模型 ✅
- **F-road 规则**: F-road ≠ 普通道路，需要 4x4 车辆
- **车辆要求**: 某些路线必须 4x4
- **河流穿越**: 需要经验和能力

### 4. 同一国家内风险层级巨大 ✅
- **RD-IS-01**: LOW 风险（新手安全壳）
- **RD-IS-02**: LOW 风险（确定性极高）
- **RD-IS-03**: HIGH 风险（强拦截路线）
- **RD-IS-04**: MEDIUM 风险（世界级徒步）

### 5. "替代路线生成"成为刚需 ✅
- 当用户不适合 RD-IS-03 时，Agent 必须提供 RD-IS-01 或 RD-IS-02 作为替代
- 替代路线生成不是可选项，而是必须项

## 关键决策场景

### 场景 1: 拦截能力
**RD-IS-03** 展示了 Agent 必须：
1. **评估用户资格**: 是否有 4x4 车辆？是否有越野经验？
2. **明确拒绝**: 如果不合适，明确拒绝
3. **给出理由**: 为什么拒绝（车辆、经验、风险等）
4. **提供替代**: 提供 RD-IS-01 或 RD-IS-02 作为替代

### 场景 2: 天气优先
**所有路线**都展示了：
- 天气可在 30 分钟内反转
- 风 > 雨 > 雪（冰岛核心现实）
- 天气窗口是硬性要求（某些路线）

### 场景 3: 道路规则
**RD-IS-03** 展示了：
- F-road ≠ 普通道路
- 需要 4x4 车辆
- 需要河流穿越能力
- 法律和规则必须纳入决策模型

### 场景 4: 风险层级
**同一国家内**展示了：
- LOW 风险: RD-IS-01, RD-IS-02
- MEDIUM 风险: RD-IS-04
- HIGH 风险: RD-IS-03

## 使用方法

### Seed 到数据库

```bash
npx ts-node --project tsconfig.backend.json scripts/seed-iceland-route-directions.ts
```

### 验证数据

```typescript
const rds = await prisma.routeDirection.findMany({
  where: { countryCode: 'IS' },
  include: { /* ... */ }
});
```

## 技术细节

### PostGIS 几何数据
每个 RouteDirection 都包含 `corridorGeom` 字段（PostGIS geography 类型），使用 `ST_GeogFromText` 函数插入。

### 数据结构
- `constraints`: 包含 `hardConstraints` 和 `softConstraints`
- `metadata`: 包含 `routeType`, `philosophy`, `demDecisionPoints`, `antiPersona`, `failureProfile`, `decisionDominance`, `nonNegotiableFacts`
- `signaturePois`: 包含 POI 列表和类型
- `itinerarySkeleton`: 包含 `dayThemes`, `dailyPace`, `objectiveWeights`

### 特殊字段
- `decisionDominance`: 决策主导顺序（如 `WEATHER > ROAD > VEHICLE > PERSONA`）
- `nonNegotiableFacts`: 不可协商事实列表
- `requiresExplicitRejection`: 是否需要明确拒绝用户
- `requiresAlternativeRoute`: 是否需要提供替代路线

## 与其他国家 Pack 的对比

| 能力 | 瑞士 | 挪威 | 冰岛 |
|------|------|------|------|
| 高 DEM 复杂度 | ✅ | ✅ | ⚠️ |
| 海岸 × DEM 联合决策 | ❌ | ✅ | ⚠️ |
| 天气作为第一变量 | ⚠️ | ✅ | ✅ |
| 连续疲劳否决 | ✅ | ✅ | ⚠️ |
| Agent 主动拒绝 | ❌ | ❌ | ✅ |
| 法律/道路规则纳入模型 | ❌ | ❌ | ✅ |
| 同一国家内风险层级巨大 | ⚠️ | ⚠️ | ✅ |
| 替代路线生成刚需 | ❌ | ❌ | ✅ |

## 后续扩展

1. **添加更多 POI**: 为每个 RouteDirection 添加真实的冰岛 POI 数据
2. **细化天气决策模型**: 根据实际使用情况调整天气窗口和风级阈值
3. **添加 RouteTemplate**: 为每个 RouteDirection 创建具体的路线模板
4. **性能监控**: 跟踪每个 RouteDirection 的成功率和失败原因
5. **拦截能力训练**: 使用 RD-IS-03 训练和改进 Agent 的拦截和拒绝逻辑
6. **替代路线生成**: 实现自动替代路线生成逻辑

## 相关文档

- [Switzerland RouteDirection Pack](./SWITZERLAND_ROUTE_DIRECTION_PACK.md)
- [Norway RouteDirection Pack](./NORWAY_ROUTE_DIRECTION_PACK.md)
- [RouteDirection Engine Technical Whitepaper](./ROUTE_DIRECTION_ENGINE_WHITEPAPER.md)
- [Country Pack Design Manual](./COUNTRY_PACK_GUIDE.md)
- [DEM Decision Evidence](./DEM_DECISION_EVIDENCE.md)

