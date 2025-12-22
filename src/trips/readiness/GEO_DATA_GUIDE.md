# 地理数据集成完整指南

## 📋 概述

本文档说明如何将全球河网、山脉、道路网络、海岸线和港口数据集成到 TripNARA 系统中，并用于准备度检查和决策层。

## 🗂️ 数据准备

### 1. 河网数据

**必需文件**（放在 `data/geographic/rivers/` 目录下）：

- **线状水系** (`rivers_line/`)：
  - `世界线状水系.shp`
  - `世界线状水系.shx`
  - `世界线状水系.dbf`
  - `世界线状水系.prj` ⚠️ 必需

- **面状水系** (`water_poly/`)：
  - `世界面状水系.shp`
  - `世界面状水系.shx`
  - `世界面状水系.dbf`
  - `世界面状水系.prj` ⚠️ 必需

### 2. 山脉数据

**必需文件**（放在 `data/geographic/mountains/` 目录下）：

- **标准版本** (`inventory_standard/`)：
  - `GMBA_Inventory_v2.0_standard.shp`
  - `GMBA_Inventory_v2.0_standard.shx`
  - `GMBA_Inventory_v2.0_standard.dbf`
  - `GMBA_Inventory_v2.0_standard.prj` ⚠️ 必需

### 3. 道路网络数据

**必需文件**（放在 `data/geographic/roads/` 目录下）：

- **世界道路** (`roads/`)：
  - `世界道路.shp`
  - `世界道路.shx`
  - `世界道路.dbf`
  - `世界道路.prj` ⚠️ 必需

- **世界铁路** (`railways/`) - 可选：
  - `世界铁路.shp`
  - `世界铁路.shx`
  - `世界铁路.dbf`
  - `世界铁路.prj` ⚠️ 必需

### 4. 海岸线数据

**必需文件**（放在 `data/geographic/coastlines/` 目录下）：

- **海岸线** (`coastlines/`)：
  - `lines.shp`
  - `lines.shx`
  - `lines.dbf`
  - `lines.prj` ⚠️ 必需

### 5. 港口数据

**必需文件**（放在 `data/geographic/ports/` 目录下）：

- **全球港口** (`ports/`)：
  - `全球港口数据 库.shp`
  - `全球港口数据 库.shx`
  - `全球港口数据 库.dbf`
  - `全球港口数据 库.prj` ⚠️ 必需

### 6. 航线数据

**必需文件**（放在 `data/geographic/airlines/` 目录下）：

- **全球航线** (`airlines/`)：
  - `T.shp`
  - `T.shx`
  - `T.dbf`
  - `T.prj` ⚠️ 必需

## 🚀 数据导入

### 导入河网数据

```bash
npx ts-node --project tsconfig.backend.json scripts/import-rivers-to-postgis.ts
```

### 导入山脉数据

```bash
npx ts-node --project tsconfig.backend.json scripts/import-mountains-to-postgis.ts
```

### 导入道路网络数据

```bash
npx ts-node --project tsconfig.backend.json scripts/import-roads-to-postgis.ts
```

### 导入海岸线数据

```bash
npx ts-node --project tsconfig.backend.json scripts/import-coastlines-to-postgis.ts
```

### 导入港口数据

```bash
npx ts-node --project tsconfig.backend.json scripts/import-ports-to-postgis.ts
```

### 导入航线数据

```bash
npx ts-node --project tsconfig.backend.json scripts/import-airlines-to-postgis.ts
```

### 一次性导入所有数据

```bash
# 导入河网
npx ts-node --project tsconfig.backend.json scripts/import-rivers-to-postgis.ts

# 导入山脉
npx ts-node --project tsconfig.backend.json scripts/import-mountains-to-postgis.ts

# 导入道路网络
npx ts-node --project tsconfig.backend.json scripts/import-roads-to-postgis.ts

# 导入海岸线
npx ts-node --project tsconfig.backend.json scripts/import-coastlines-to-postgis.ts

# 导入港口
npx ts-node --project tsconfig.backend.json scripts/import-ports-to-postgis.ts

# 导入航线
npx ts-node --project tsconfig.backend.json scripts/import-airlines-to-postgis.ts
```

## 💻 使用服务

### 1. 单独使用河网服务

```typescript
import { GeoFactsRiverService } from './readiness/services/geo-facts-river.service';

constructor(private riverService: GeoFactsRiverService) {}

// 查询点位河网特征
const riverFeatures = await this.riverService.getRiverFeaturesForPoint(lat, lng);
// {
//   nearestRiverDistanceM: 180,
//   nearRiver: true,
//   riverCrossingCount: 0,
//   riverDensityScore: 0.73,
//   nearWaterPolygon: false,
//   nearestWaterPolygonDistanceM: 350
// }

// 查询路线河网特征
const routeRiverFeatures = await this.riverService.getRiverFeaturesForRoute({
  points: [{ lat, lng }, ...]
});
```

### 2. 单独使用山脉服务

```typescript
import { GeoFactsMountainService } from './readiness/services/geo-facts-mountain.service';

constructor(private mountainService: GeoFactsMountainService) {}

// 查询点位山脉特征
const mountainFeatures = await this.mountainService.getMountainFeaturesForPoint(lat, lng);
// {
//   inMountain: true,
//   mountainElevationAvg: 1200,
//   mountainElevationMax: 1500,
//   mountainElevationMin: 800,
//   mountainDensityScore: 0.65,
//   terrainComplexity: 0.72,
//   nearestMountainDistanceM: 0
// }
```

### 3. 使用统一地理特征服务（推荐）

```typescript
import { GeoFactsService } from './readiness/services/geo-facts.service';

constructor(private geoFactsService: GeoFactsService) {}

// 查询点位综合地理特征
const geoFeatures = await this.geoFactsService.getGeoFeaturesForPoint(lat, lng);
// {
//   rivers: { ... },           // 河网特征
//   mountains: { ... },       // 山脉特征
//   roads: { ... },            // 道路网络特征
//   coastlines: { ... },       // 海岸线特征
//   ports: { ... },            // 港口特征
//   terrainComplexity: 0.85,   // 综合地形复杂度
//   riskScore: 0.65,           // 综合风险评分
//   accessibilityScore: 0.72   // 交通便利性评分（结合道路和港口）
// }

// 查询路线综合地理特征
const routeGeoFeatures = await this.geoFactsService.getGeoFeaturesForRoute({
  points: [{ lat, lng }, ...]
});
```

## 🎯 核心特征说明

### 河网特征（RiverFeatures）

| 特征 | 说明 | 用途 |
|------|------|------|
| `nearRiver` | 是否靠近河网（< 500m） | 体验：河谷风景<br>风险：雨季涨水、湿滑 |
| `riverCrossingCount` | 路线穿越河流次数 | 复杂度：桥多/绕行多<br>风险：偏远、需要离线地图 |
| `riverDensityScore` | 河网密度评分（0-1） | 体验：自然探索/摄影<br>风险：湿滑、蚊虫、洪涝 |
| `nearWaterPolygon` | 是否靠近面状水域（< 200m） | 地图表达、水边景观推荐 |

### 山脉特征（MountainFeatures）

| 特征 | 说明 | 用途 |
|------|------|------|
| `inMountain` | 是否在山脉区域内 | 地形识别、路线规划 |
| `mountainElevationAvg/Max/Min` | 山脉海拔信息 | 高反风险评估、难度评估 |
| `mountainDensityScore` | 山脉密度评分（0-1） | 地形复杂度、路线选择 |
| `terrainComplexity` | 地形复杂度评分（0-1） | 综合难度评估 |

### 道路网络特征（RoadFeatures）

| 特征 | 说明 | 用途 |
|------|------|------|
| `nearRoad` | 是否靠近道路（< 500m） | 交通便利性、救援可达性 |
| `roadDensityScore` | 道路密度评分（0-1） | 区域开发程度、交通便利性 |
| `roadAccessibility` | 道路可达性评分（0-1） | 综合交通便利性评估 |
| `primaryRoadType` | 主要道路类型 | 路线规划、交通方式选择 |

### 海岸线特征（CoastlineFeatures）

| 特征 | 说明 | 用途 |
|------|------|------|
| `nearCoastline` | 是否靠近海岸线（< 5km） | 海岸景观、海浪风险 |
| `isCoastalArea` | 是否在沿海区域（< 50km） | 沿海地区识别、气候特征 |
| `coastlineDensityScore` | 海岸线密度评分（0-1） | 海岸复杂度、景观丰富度 |
| `nearestCoastlineDistanceM` | 到最近海岸线的距离（米） | 精确距离计算 |

### 港口特征（PortFeatures）

| 特征 | 说明 | 用途 |
|------|------|------|
| `nearPort` | 是否靠近港口（< 10km） | 港口城市、邮轮/渡轮交通 |
| `nearestPortDistanceM` | 到最近港口的距离（米） | 精确距离计算 |
| `portDensityScore` | 港口密度评分（0-1） | 港口城市群、海运发达地区 |
| `nearestPortName` | 最近港口的名称 | 提供具体港口信息 |
| `nearestPortProperties` | 最近港口的属性信息 | 港口详细信息（类型、规模等） |

### 航线特征（AirlineFeatures）

| 特征 | 说明 | 用途 |
|------|------|------|
| `nearAirport` | 是否靠近机场（< 20km） | 机场城市、航空交通便利 |
| `nearestAirportDistanceM` | 到最近机场的距离（米） | 精确距离计算 |
| `airlineDensityScore` | 航线/机场密度评分（0-1） | 航空枢纽城市、多机场区域 |
| `nearestAirportName` | 最近机场的名称 | 提供具体机场信息 |

### 综合特征（GeoFeatures）

| 特征 | 说明 | 用途 |
|------|------|------|
| `terrainComplexity` | 综合地形复杂度（0-1） | 结合河网和山脉的综合评估 |
| `riskScore` | 综合风险评分（0-1） | 基于河网、山脉和道路的风险评估 |
| `accessibilityScore` | 交通便利性评分（0-1） | 基于道路网络、港口和航线的可达性评估 |

## 🔗 集成到 Readiness 模块

### 在 Readiness Pack 规则中使用

```typescript
{
  id: 'rule.geo.safety.mountain-flood-risk',
  category: 'safety_hazards',
  severity: 'high',
  when: {
    all: [
      { path: 'geo.mountains.inMountain', eq: true },
      { path: 'geo.rivers.nearRiver', eq: true },
      { path: 'itinerary.season', eq: 'rainy' },
    ],
  },
  then: {
    level: 'must',
    message: '路线位于山脉且靠近河网，雨季需特别注意山洪和滑坡风险',
    tasks: [
      {
        title: '关注天气预报，避免暴雨期间出行',
        dueOffsetDays: -1,
        tags: ['safety', 'weather'],
      },
    ],
  },
}
```

### 在 FactsToReadinessCompiler 中扩展

```typescript
// 在 facts-to-readiness.compiler.ts 中
async compileWithGeoFacts(
  countryFacts: CountryFacts,
  context: TripContext,
  geoFeatures: GeoFeatures
): Promise<ReadinessFinding> {
  const findings: any[] = [];

  // 高海拔检查
  if (geoFeatures.mountains.mountainElevationMax && 
      geoFeatures.mountains.mountainElevationMax > 3000) {
    findings.push({
      level: 'should',
      message: '路线涉及高海拔区域，需注意高反风险',
      category: 'health_insurance',
    });
  }

  // 山脉 + 河网 + 雨季
  if (geoFeatures.mountains.inMountain && 
      geoFeatures.rivers.nearRiver && 
      context.itinerary.season === 'rainy') {
    findings.push({
      level: 'must',
      message: '山脉河谷地形，雨季需特别注意山洪和滑坡',
      category: 'safety_hazards',
    });
  }

  // 高地形复杂度
  if (geoFeatures.terrainComplexity > 0.7) {
    findings.push({
      level: 'should',
      message: '地形复杂，建议准备离线地图和导航设备',
      category: 'gear_packing',
    });
  }

  return { findings, ... };
}
```

## 🎯 集成到决策层（Abu/Dr.Dre/Neptune）

### 在约束编译器中添加地理约束

```typescript
// 在 readiness-to-constraints.compiler.ts 中
compileGeoConstraints(features: GeoFeatures): Constraint[] {
  const constraints: Constraint[] = [];

  // 高海拔 → 避免夜间长途
  if (features.mountains.mountainElevationMax && 
      features.mountains.mountainElevationMax > 4000) {
    constraints.push({
      type: 'soft',
      severity: 'warning',
      message: '高海拔区域，建议避免夜间长途',
      condition: (candidate) => {
        return candidate.startTime && isNightTime(candidate.startTime);
      },
    });
  }

  // 高河网密度 + 雨季 → 湿滑风险
  if (features.rivers.riverDensityScore > 0.7 && season === 'rainy') {
    constraints.push({
      type: 'soft',
      severity: 'warning',
      message: '河网密集区域，雨季需注意湿滑路面',
    });
  }

  // 高地形复杂度 → 增加 buffer
  if (features.terrainComplexity > 0.7) {
    constraints.push({
      type: 'soft',
      severity: 'info',
      message: '地形复杂，建议增加路线时间 buffer',
    });
  }

  // 高风险评分 → 避免高风险活动
  if (features.riskScore > 0.7) {
    constraints.push({
      type: 'soft',
      severity: 'warning',
      message: '综合风险较高，建议选择更安全的路线',
    });
  }

  return constraints;
}
```

## 📊 使用场景示例

### 场景 1：峡谷路线评估

```typescript
const geoFeatures = await this.geoFactsService.getGeoFeaturesForRoute(route);

// 高海拔 + 河网密集 → 峡谷地形
if (geoFeatures.mountains.inMountain && 
    geoFeatures.mountains.mountainElevationMax > 2000 &&
    geoFeatures.rivers.riverDensityScore > 0.7) {
  // 峡谷地形特征
  // - 注意：山洪风险、湿滑路面
  // - 建议：准备防水装备、关注天气
}
```

### 场景 2：高海拔路线评估

```typescript
const geoFeatures = await this.geoFactsService.getGeoFeaturesForPoint(lat, lng);

// 高海拔检查
if (geoFeatures.mountains.mountainElevationMax && 
    geoFeatures.mountains.mountainElevationMax > 3000) {
  // 高海拔特征
  // - 注意：高反风险、低温、天气变化
  // - 建议：准备高反药物、保暖装备、关注天气
}
```

### 场景 3：综合风险评估

```typescript
const geoFeatures = await this.geoFactsService.getGeoFeaturesForRoute(route);

// 综合风险评分
if (geoFeatures.riskScore > 0.7) {
  // 高风险路线
  // - 建议：增加安全措施、准备应急方案
  // - 提醒：避免单独行动、准备离线地图
}
```

### 场景 4：偏远区域评估

```typescript
const geoFeatures = await this.geoFactsService.getGeoFeaturesForPoint(lat, lng);

// 道路少 + 河网密集 + 山脉 → 偏远高风险区域
if (!geoFeatures.roads.nearRoad && 
    geoFeatures.rivers.riverDensityScore > 0.7 &&
    geoFeatures.mountains.inMountain) {
  // 偏远高风险区域
  // - 注意：救援困难、信号差、路线复杂
  // - 建议：准备离线地图、应急方案、卫星通信设备
}
```

### 场景 5：交通便利性评估

```typescript
const geoFeatures = await this.geoFactsService.getGeoFeaturesForPoint(lat, lng);

// 交通便利性评分
if (geoFeatures.accessibilityScore < 0.3) {
  // 交通不便区域
  // - 注意：救援困难、信号可能较差
  // - 建议：准备离线地图、应急方案
} else if (geoFeatures.accessibilityScore > 0.7) {
  // 交通便利区域
  // - 优势：救援容易、基础设施完善
}
```

### 场景 6：海岸区域评估

```typescript
const geoFeatures = await this.geoFactsService.getGeoFeaturesForPoint(lat, lng);

// 海岸线 + 河网 → 河口/三角洲区域
if (geoFeatures.coastlines.nearCoastline && 
    geoFeatures.rivers.riverDensityScore > 0.7) {
  // 河口/三角洲区域
  // - 注意：湿地、涨潮风险
  // - 体验：丰富的水生生态系统
}

// 海岸线 + 山脉 → 海岸山脉/悬崖地形
if (geoFeatures.coastlines.nearCoastline && 
    geoFeatures.mountains.inMountain) {
  // 海岸山脉/悬崖地形
  // - 注意：悬崖风险、落石风险
  // - 体验：壮观的海岸景观
}

// 海岸线 + 道路 → 沿海公路/旅游路线
if (geoFeatures.coastlines.nearCoastline && 
    geoFeatures.roads.roadDensityScore > 0.5) {
  // 沿海公路/旅游路线
  // - 优势：交通便利、基础设施完善
  // - 体验：沿海风景路线
}
```

## 📚 相关文档

- [河网数据快速开始](../../../data/geographic/rivers/QUICK_START.md)
- [山脉数据快速开始](../../../data/geographic/mountains/QUICK_START.md)
- [Readiness Module README](./README.md)

