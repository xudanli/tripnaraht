# 西藏 Readiness 使用指南

## 概述

本文档说明如何使用西藏 Readiness Pack 进行旅行准备度检查。

## 快速开始

### 1. 导入 Readiness Pack

```typescript
import { xizangPack } from './readiness/data/xizang-pack.example';
import { ReadinessService } from './readiness/services/readiness.service';

// 在服务中注入 ReadinessService
constructor(private readonly readinessService: ReadinessService) {}
```

### 2. 执行准备度检查

```typescript
// 构建 TripContext
const context: TripContext = {
  traveler: {
    nationality: 'CN',
    budgetLevel: 'medium',
    riskTolerance: 'medium',
  },
  trip: {
    startDate: '2025-07-01',
    endDate: '2025-07-10',
  },
  itinerary: {
    countries: ['CN'],
    activities: ['sightseeing', 'hiking'],
    season: 'summer',
  },
};

// 执行检查（带地理特征增强）
const result = await this.readinessService.checkFromPacks(
  [xizangPack],
  context,
  {
    enhanceWithGeo: true,
    geoLat: 29.6544,  // 拉萨纬度
    geoLng: 91.1322,  // 拉萨经度
  }
);

// 获取约束
const constraints = await this.readinessService.getConstraints(result);

// 获取任务列表
const tasks = await this.readinessService.getTasks(result);
```

## 核心规则说明

### 1. 高海拔适应（必须）

**触发条件**：
- `itinerary.countries` 包含 'CN' **或**
- `geo.altitude_m >= 3000`

**规则行为**：
- 生成高海拔适应计划（D1 轻量，D2 增加强度）
- 提示准备海拔病药物和便携式氧气
- 询问用户是否有高海拔旅行经验

**示例输出**：
```typescript
{
  level: 'must',
  message: '高海拔地区需要逐步适应。第一天轻量活动，第二天再增加强度。',
  tasks: [
    { title: '制定高海拔适应计划', dueOffsetDays: -7 },
    { title: '准备海拔病药物（如乙酰唑胺）', dueOffsetDays: -14 },
    { title: '准备便携式氧气（>4000m 区域）', dueOffsetDays: -7 },
  ],
  askUser: [
    '是否有高海拔旅行经验？',
    '是否有心血管或呼吸系统疾病？',
  ],
}
```

### 2. 补给稀疏检测（必须）

**触发条件**：
- `geo.fuelDensity` 存在 **且**
- `geo.fuelDensity < 0.5`（每 100km 少于 0.5 个加油站）

**规则行为**：
- 提示提前规划燃料补给点
- 建议在主要城市储备物资
- 准备备用燃料

**示例输出**：
```typescript
{
  level: 'must',
  message: '沿途补给点稀疏。必须提前规划燃料和物资补给。',
  tasks: [
    { title: '规划燃料补给点', dueOffsetDays: -7 },
    { title: '在主要城市（拉萨、日喀则）储备物资', dueOffsetDays: -1 },
    { title: '准备备用燃料（偏远地区）', dueOffsetDays: -3 },
  ],
}
```

### 3. 检查站提醒（应该）

**触发条件**：
- `geo.checkpointCount > 0` **或**
- `geo.poiNames` 包含 '检查站'/'边防'/'边检'

**规则行为**：
- 提示准备证件和边防证
- 预留缓冲时间
- 询问是否需要边防证

**示例输出**：
```typescript
{
  level: 'should',
  message: '行程经过检查站/边防区域。请准备证件和边防证，预留缓冲时间。',
  tasks: [
    { title: '准备边防证（如需要）', dueOffsetDays: -14 },
    { title: '检查证件有效期', dueOffsetDays: -7 },
  ],
  askUser: [
    '是否需要边防证？',
    '是否了解拍照限制？',
  ],
}
```

### 4. 山口风险（冬季必须）

**触发条件**：
- `geo.mountainPassCount > 0` **且**
- `trip.season === 'winter'`

**规则行为**：
- 提示查询山口路况和封路信息
- 准备防滑链和冬季轮胎
- 规划避开夜间行驶

**示例输出**：
```typescript
{
  level: 'must',
  message: '冬季山口/垭口可能封闭或危险。避免夜间行驶，提前查询路况。',
  tasks: [
    { title: '查询山口路况和封路信息', dueOffsetDays: -1 },
    { title: '准备防滑链和冬季轮胎', dueOffsetDays: -7 },
    { title: '规划避开夜间行驶', dueOffsetDays: -3 },
  ],
}
```

### 5. 氧气点识别（应该）

**触发条件**：
- `geo.altitude_m >= 4000` **且**
- `geo.oxygenStationCount > 0`

**规则行为**：
- 提示标记附近氧气点位置

## 地理特征数据来源

地理特征通过 `GeoFactsService` 自动提取：

```typescript
const geoFeatures = await geoFactsService.getGeoFeaturesForPoint(
  29.6544,  // 拉萨纬度
  91.1322,   // 拉萨经度
  {
    poiRadiusKm: 50,  // 搜索半径 50km
  }
);

// 西藏特有特征
const xizangFeatures = geoFeatures.pois.xizang;
// {
//   oxygenStationCount: 3,
//   checkpointCount: 2,
//   mountainPassCount: 1,
//   avgAltitudeM: 3650,
//   fuelDensity: 0.8,  // 每 100km 0.8 个加油站
// }
```

## 与决策层集成

Readiness 检查结果会自动转换为约束，影响决策：

```typescript
// 在 TripDecisionEngineService 中
const readinessResult = await this.readinessService.checkFromDestination(
  'CN-XIZANG',
  context,
  { enhanceWithGeo: true, geoLat: 29.6544, geoLng: 91.1322 }
);

// 转换为约束
const constraints = await this.readinessService.getConstraints(readinessResult);

// 添加到 state.signals.alerts
state.signals.alerts.push(...constraints.map(c => ({
  code: c.id,
  severity: c.severity === 'error' ? 'critical' : 'warn',
  message: c.message,
  details: {
    type: c.type,
    severity: c.severity,
    tasks: c.tasks,
    askUser: c.askUser,
  },
})));
```

## 约束类型映射

- **Blockers / Must** → Hard Constraints (error)
- **Should** → Soft Constraints (warning)
- **Optional** → Soft Constraints (info)

## 使用场景示例

### 场景 1：拉萨出发的 10 天行程

```typescript
const context: TripContext = {
  traveler: { nationality: 'CN', budgetLevel: 'medium' },
  trip: { startDate: '2025-07-01', endDate: '2025-07-10' },
  itinerary: {
    countries: ['CN'],
    activities: ['sightseeing', 'hiking'],
    season: 'summer',
  },
};

const result = await readinessService.checkFromPacks(
  [xizangPack],
  context,
  {
    enhanceWithGeo: true,
    geoLat: 29.6544,  // 拉萨
    geoLng: 91.1322,
  }
);

// 预期触发：
// 1. 高海拔适应（must）- 因为 altitude_m >= 3000
// 2. 补给稀疏（可能）- 取决于 fuelDensity
// 3. 检查站提醒（可能）- 取决于 checkpointCount
```

### 场景 2：冬季珠峰大本营

```typescript
const context: TripContext = {
  traveler: { nationality: 'CN', riskTolerance: 'high' },
  trip: { startDate: '2025-12-15', endDate: '2025-12-25' },
  itinerary: {
    countries: ['CN'],
    activities: ['hiking', 'photography'],
    season: 'winter',
  },
};

const result = await readinessService.checkFromPacks(
  [xizangPack],
  context,
  {
    enhanceWithGeo: true,
    geoLat: 28.6611,  // 定日/珠峰大本营
    geoLng: 86.6306,
  }
);

// 预期触发：
// 1. 高海拔适应（must）- altitude_m >= 3000
// 2. 补给稀疏（must）- 偏远地区 fuelDensity 低
// 3. 山口风险（must）- 冬季 + mountainPassCount > 0
// 4. 检查站提醒（should）- 珠峰区域有检查站
```

## 注意事项

1. **地理特征增强**：需要提供坐标（`geoLat`, `geoLng`）才能启用
2. **数据覆盖**：OSM 在西藏偏远地区覆盖稀疏，部分特征可能缺失
3. **海拔信息**：优先使用 OSM `ele` 字段，缺失时自动从 DEM 数据查询补齐
4. **坐标系统**：OSM 使用 WGS84，如果前端使用 GCJ-02，需要转换

## 相关文件

- `src/trips/readiness/data/xizang-pack.example.ts` - Readiness Pack
- `src/trips/readiness/services/readiness.service.ts` - Readiness 服务
- `src/trips/readiness/services/geo-facts-poi.service.ts` - POI 特征服务
- `docs/XIZANG_POI_INTEGRATION.md` - POI 集成文档

