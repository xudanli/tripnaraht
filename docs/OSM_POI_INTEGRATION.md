# OSM POI 数据集成到决策层指南

## 📋 概述

本文档说明如何将 OSM POI 数据集成到 TripNARA 的决策层（Abu / Dr.Dre / Neptune），以斯瓦尔巴场景为例。

## 🎯 核心功能

### 1. 出海集合点识别和评分

**问题**：OSM 里不一定每个"出海集合点"都被标成 `ferry_terminal`，需要智能推断。

**解决方案**：`POIPickupScorerService` 提供候选点评分器。

**评分规则**：
- +100：`amenity=ferry_terminal`（强信号）
- +60：`man_made=pier`（中强信号）
- +40：`leisure=marina` / `landuse=harbour`（港区语义）
- +30：`tourism=information`（游客中心/集合说明更清晰）
- +20：有 `website/phone/opening_hours`（可联系/可核验）
- +15：距离海岸线 < 300m
- +10：`office=tourism` / `tourism=agency`（旅行社/运营商入口）
- -30：明显是 `cargo/industrial`（货运港区）

**输出**：Top 1~3 个"最可能集合点"，每个点带解释。

### 2. 徒步入口识别

**问题**：斯瓦尔巴步道入口需要识别并配对停车点。

**解决方案**：`POITrailheadService` 提供徒步入口识别和配对。

**识别策略**：
1. 优先：`highway=trailhead`（强信号）
2. 补充：`tourism=information` + 附近 50m 有 `highway=path`
3. 配对：入口点 + 最近停车点 → `TrailAccessPoint`

**输出**：可执行的入口信息（从哪停车、从哪进步道）。

### 3. 安全保障点和补给点检查

**功能**：检查区域内是否有医院、药房、加油站、超市等关键保障点。

## 🔗 接入决策层

### Abu（降级保体验）

**场景**：如果找不到高置信"集合点/入口点"

```typescript
const geoFeatures = await geoFactsService.getGeoFeaturesForPoint(lat, lng);

// 检查集合点
if (geoFeatures.pois.topPickupPoints.length === 0) {
  // 降级：推荐 + 需要确认
  return {
    level: 'should',
    message: '未找到明确的出海集合点，建议提前联系旅行社确认集合地点',
    confidence: 'low',
  };
}

// 检查集合点置信度
const topPickup = geoFeatures.pois.topPickupPoints[0];
if (topPickup.score < 50) {
  // 低置信度：需要确认
  return {
    level: 'should',
    message: `找到可能的集合点：${topPickup.name}，但置信度较低，建议提前确认`,
    confidence: 'medium',
  };
}
```

### Dr.Dre（带约束排程）

**场景**：把"到达后先去游客中心/集合点踩点、确认出海集合时间、补给/药房"排成任务

```typescript
const geoFeatures = await geoFactsService.getGeoFeaturesForPoint(lat, lng);

const tasks = [];

// 如果有集合点，添加"踩点"任务
if (geoFeatures.pois.topPickupPoints.length > 0) {
  const pickup = geoFeatures.pois.topPickupPoints[0];
  tasks.push({
    title: `前往集合点确认：${pickup.name}`,
    dueOffsetDays: -1, // T-1
    category: 'logistics',
    location: { lat: pickup.lat, lng: pickup.lng },
    reasons: pickup.reasons,
  });
}

// 如果有信息点，添加"获取信息"任务
if (geoFeatures.pois.information.hasInformationPoint) {
  tasks.push({
    title: '前往游客中心获取最新信息',
    dueOffsetDays: -1,
    category: 'information',
  });
}

// 如果有药房，添加"准备药品"任务
if (geoFeatures.pois.safety.hasPharmacy) {
  tasks.push({
    title: '准备常用药品（如有需要）',
    dueOffsetDays: -1,
    category: 'safety',
  });
}

// 如果有补给点，添加"补给"任务
if (geoFeatures.pois.supply.hasSupermarket) {
  tasks.push({
    title: '采购补给物资',
    dueOffsetDays: 0, // 当天早晨
    category: 'supply',
  });
}
```

### Neptune（最小改动修复）

**场景**：如果某出海活动集合点不可达/太远 → 换下一个高分集合点

```typescript
const geoFeatures = await geoFactsService.getGeoFeaturesForPoint(lat, lng);

// 检查集合点可达性
function findAccessiblePickupPoint(
  pickupPoints: PickupPoint[],
  currentLocation: { lat: number; lng: number },
  maxDistanceKm: number = 5
): PickupPoint | null {
  for (const pickup of pickupPoints) {
    const distance = calculateDistance(
      currentLocation,
      { lat: pickup.lat, lng: pickup.lng }
    );
    
    if (distance <= maxDistanceKm) {
      return pickup;
    }
  }
  
  return null;
}

// 如果第一个集合点太远，尝试下一个
let selectedPickup = findAccessiblePickupPoint(
  geoFeatures.pois.topPickupPoints,
  currentLocation
);

if (!selectedPickup && geoFeatures.pois.topPickupPoints.length > 1) {
  // 尝试第二个
  selectedPickup = findAccessiblePickupPoint(
    geoFeatures.pois.topPickupPoints.slice(1),
    currentLocation,
    10 // 放宽到 10km
  );
}

if (!selectedPickup) {
  // 如果都不可达，建议换到更可执行的港区附近
  return {
    action: 'relocate',
    message: '建议将活动安排到更靠近港区的区域',
    alternativeLocations: geoFeatures.pois.topPickupPoints.slice(0, 3),
  };
}
```

## 📊 POI Features 结构

```typescript
interface POIFeatures {
  // 出海集合点（Top 3，按评分排序）
  topPickupPoints: Array<{
    poiId: string;
    name: string;
    lat: number;
    lng: number;
    score: number;           // 评分（越高越可能是集合点）
    reasons: string[];      // 评分原因
    category: string;
    distanceToCoastlineM: number | null;
    hasContactInfo: boolean;
    tags: Record<string, any>;
  }>;
  
  // 是否有港口/码头
  hasHarbour: boolean;
  
  // 徒步入口点（带停车点配对）
  trailAccessPoints: Array<{
    trailheadId: string;
    trailheadName: string;
    trailheadLat: number;
    trailheadLng: number;
    parkingId: string | null;
    parkingName: string | null;
    parkingLat: number | null;
    parkingLng: number | null;
    parkingDistanceM: number | null;
    informationPointId: string | null;
    informationPointName: string | null;
    pathConnections: number;
  }>;
  
  // 安全保障点
  safety: {
    hasHospital: boolean;
    hasClinic: boolean;
    hasPharmacy: boolean;
    hasPolice: boolean;
    hasFireStation: boolean;
  };
  
  // 补给点
  supply: {
    hasFuel: boolean;
    hasSupermarket: boolean;
    hasConvenience: boolean;
  };
  
  // 信息点
  information: {
    hasInformationPoint: boolean;
    hasViewpoint: boolean;
  };
}
```

## 🚀 使用示例

### 完整查询示例

```typescript
import { GeoFactsService } from './readiness/services/geo-facts.service';

// 查询斯瓦尔巴 Longyearbyen 的综合地理特征
const geoFeatures = await geoFactsService.getGeoFeaturesForPoint(
  78.223,  // Longyearbyen 纬度
  15.626,  // Longyearbyen 经度
  {
    poiRadiusKm: 25,    // POI 搜索半径
    pickupLimit: 3,     // 返回 Top 3 集合点
  }
);

// 使用 POI 特征
console.log('Top 集合点:', geoFeatures.pois.topPickupPoints);
console.log('徒步入口:', geoFeatures.pois.trailAccessPoints);
console.log('安全保障:', geoFeatures.pois.safety);
console.log('补给点:', geoFeatures.pois.supply);
```

## 📝 注意事项

1. **数据依赖**：POI 服务依赖 `poi_canonical` 表，需要先运行：
   - `fetch-osm-poi-svalbard.ts` - 抓取 OSM 数据
   - `import-osm-poi-to-postgis.ts` - 导入原始数据
   - `normalize-osm-poi.ts` - 规范化处理

2. **海岸线数据**：集合点评分需要 `geo_coastlines` 表来计算距离海岸线的距离。

3. **道路数据**：徒步入口识别需要 `geo_roads` 表来查找连接的步道。

4. **性能**：POI 查询涉及多个空间查询，建议使用适当的索引。

## 🔗 相关文档

- [地理数据集成指南](../src/trips/readiness/GEO_DATA_GUIDE.md)
- [POI 数据目录](../data/geographic/poi/README.md)
- [集合点评分算法](../src/trips/readiness/services/poi-pickup-scorer.service.ts)
- [徒步入口识别](../src/trips/readiness/services/poi-trailhead.service.ts)

