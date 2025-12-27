# 🇵🇪 Peru RouteDirection Pack (Production Ready)

## 概述

秘鲁 RouteDirection Pack 是 TripNARA 路线引擎的第四个**生产级国家包**。如果说冰岛考验的是自然，那秘鲁考验的是人。

**核心价值：**
- 从"地理风险" → "人类生理极限"
- 引入人类生理画像（HumanPhysiologyProfile）
- 高海拔适应期强制要求
- 缺氧风险曲线

**国家级新变量（这是冰岛没有的）：**
```typescript
HumanPhysiologyProfile {
  altitudeAdaptationRequired: true,
  hypoxiaRiskCurve: true,
  acclimatizationDays: mandatory
}
```

## RouteDirection 列表

### RD-PE-01: Inca Trail
**印加古道 · 逐级适应**

- **类型**: HIKING
- **最佳月份**: 5, 6, 7, 8, 9
- **避免月份**: 11, 12, 1, 2, 3
- **典型时长**: 5 天
- **标签**: 徒步, 文化, 高海拔, 历史

**核心约束：**
- 硬约束: 
  - `maxElevationM: 4200`
  - `mandatoryAcclimatizationDays: 2` → 强制适应 2 天
  - `rapidAscentForbidden: true`
- 软约束: `maxDailyAscentM: 700`, `bufferTimeMin: 120`

**人类生理要求：**
- `altitudeAdaptationRequired: true`
- `hypoxiaRiskCurve: true`
- `acclimatizationDays: 2` → 强制适应 2 天
- `maxElevationM: 4200`

**哲学**: "文明不是建在低地的。"

**失败画像：**
- 常见失败日期: [1, 2]
- 典型失败原因: ['altitude', 'fatigue']
- 救援难度: MEDIUM

**休息日要求**: 前 2 天必须休息适应

---

### RD-PE-02: Ausangate Circuit
**奥桑加特环线 · 生理极限**

- **类型**: HIKING
- **最佳月份**: 5, 6, 7, 8, 9
- **避免月份**: 11, 12, 1, 2, 3
- **典型时长**: 6 天
- **标签**: 徒步, 高海拔, 挑战, 极限

**核心约束：**
- 硬约束: 
  - `maxElevationM: 5200`
  - `rapidAscentForbidden: true`
  - `guideRequired: true` → 必须向导
  - `mandatoryAcclimatizationDays: 3` → 强制适应 3 天
- 软约束: `maxDailyAscentM: 600`, `bufferTimeMin: 180`

**人类生理要求：**
- `altitudeAdaptationRequired: true`
- `hypoxiaRiskCurve: true`
- `acclimatizationDays: 3` → 强制适应 3 天
- `maxElevationM: 5200`

**哲学**: "这不是风景问题，是身体问题。"

**失败画像：**
- 常见失败日期: [1, 2, 3]
- 典型失败原因: ['altitude', 'hypoxia', 'fatigue']
- 救援难度: HIGH

**不适合的用户：**
- 高反经验为 0
- 追求舒适
- 无高海拔适应经验

**休息日要求**: 前 3 天必须休息适应

**备注**: 这是人类耐力测试，高反风险极高。

---

### RD-PE-03: Sacred Valley
**圣谷文化缓冲**

- **类型**: CULTURAL_SCENIC
- **最佳月份**: 5, 6, 7, 8, 9, 10
- **避免月份**: 11, 12, 1, 2, 3
- **典型时长**: 4 天
- **标签**: 文化, 适应, 低强度

**核心约束：**
- 硬约束: {}
- 软约束: `gradualAscent: true`, `bufferTimeMin: 60`

**人类生理要求：**
- `altitudeAdaptationRequired: true`
- `hypoxiaRiskCurve: false` → 低风险
- `acclimatizationDays: 1` → 建议 1 天适应
- `maxElevationM: 3400`

**哲学**: "让身体追上灵魂。"

**失败画像：**
- 常见失败日期: []
- 典型失败原因: []
- 救援难度: LOW

**备注**: 这是文化缓冲带，适合高海拔适应，同时体验印加文化。

---

## 系统价值

### 1. 人类生理极限纳入模型 ✅
- **RD-PE-01**: 4200m，强制适应 2 天
- **RD-PE-02**: 5200m，强制适应 3 天，必须向导
- **RD-PE-03**: 3400m，建议适应 1 天

### 2. 高海拔适应期强制要求 ✅
- 系统必须在前 N 天插入适应日
- 适应日不允许高强度活动
- 适应期是硬约束，不是建议

### 3. 缺氧风险曲线 ✅
- 不同海拔有不同的缺氧风险
- 系统需要计算和评估风险
- 高风险路线需要更多适应期

### 4. 从"地理风险" → "人类生理极限" ✅
- 冰岛：自然风险（天气、道路、地形）
- 秘鲁：人类生理风险（高反、缺氧、疲劳）

## 关键决策场景

### 场景 1: 强制适应期
**RD-PE-01** 和 **RD-PE-02** 展示了：
- 系统必须在前 N 天插入适应日
- 适应日不允许高强度活动
- 违反适应期要求 = 硬违规

### 场景 2: 人类生理评估
**RD-PE-02** 展示了：
- 必须评估用户的高反经验
- 无经验用户必须被拒绝或降级
- 必须向导的路线不能单独前往

### 场景 3: 逐级适应
**RD-PE-03** 展示了：
- 文化缓冲带的作用
- 让身体追上灵魂
- 低强度适应路线的重要性

## 使用方法

### Seed 到数据库

```bash
npx ts-node --project tsconfig.backend.json scripts/seed-peru-route-directions.ts
```

### 验证数据

```typescript
const rds = await prisma.routeDirection.findMany({
  where: { countryCode: 'PE' },
  include: { /* ... */ }
});
```

## 技术细节

### PostGIS 几何数据
每个 RouteDirection 都包含 `corridorGeom` 字段（PostGIS geography 类型），使用 `ST_GeogFromText` 函数插入。

### 数据结构
- `constraints`: 包含 `hardConstraints` 和 `softConstraints`
- `metadata.humanPhysiologyProfile`: 人类生理要求
  - `altitudeAdaptationRequired`: 是否需要高海拔适应
  - `hypoxiaRiskCurve`: 是否有缺氧风险曲线
  - `acclimatizationDays`: 强制适应天数
  - `maxElevationM`: 最大海拔

## 与其他国家 Pack 的对比

| 能力 | 瑞士 | 挪威 | 冰岛 | 秘鲁 |
|------|------|------|------|------|
| 高 DEM 复杂度 | ✅ | ✅ | ⚠️ | ⚠️ |
| 天气作为第一变量 | ⚠️ | ✅ | ✅ | ❌ |
| 人类生理极限 | ❌ | ❌ | ❌ | ✅ |
| 强制适应期 | ❌ | ❌ | ❌ | ✅ |
| 缺氧风险曲线 | ❌ | ❌ | ❌ | ✅ |

## 后续扩展

1. **添加更多 POI**: 为每个 RouteDirection 添加真实的秘鲁 POI 数据
2. **细化高反模型**: 根据实际使用情况调整适应期和风险曲线
3. **添加 RouteTemplate**: 为每个 RouteDirection 创建具体的路线模板
4. **性能监控**: 跟踪每个 RouteDirection 的成功率和失败原因
5. **人类生理评估**: 实现用户高反经验评估和适配逻辑

## 相关文档

- [Switzerland RouteDirection Pack](./SWITZERLAND_ROUTE_DIRECTION_PACK.md)
- [Norway RouteDirection Pack](./NORWAY_ROUTE_DIRECTION_PACK.md)
- [Iceland RouteDirection Pack](./ICELAND_ROUTE_DIRECTION_PACK.md)
- [Extreme Country Template](./EXTREME_COUNTRY_TEMPLATE.md)
- [Weather Decision Evidence](./WEATHER_DECISION_EVIDENCE.md)
- [RouteDirection Engine Technical Whitepaper](./ROUTE_DIRECTION_ENGINE_WHITEPAPER.md)

