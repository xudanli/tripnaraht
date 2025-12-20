# 道路网络数据快速开始指南

## 📋 需要哪些文件？

### ✅ 必需：世界道路

**从 `世界铁路和道路` 文件夹复制以下文件到 `data/geographic/roads/roads/`：**

- ✅ `世界道路.shp` - 几何数据
- ✅ `世界道路.shx` - 空间索引
- ✅ `世界道路.dbf` - 属性表（包含道路类型等信息）
- ✅ `世界道路.prj` - 坐标系定义（**非常关键**）

### ✅ 可选：世界铁路

如果需要铁路数据，复制到 `data/geographic/roads/railways/`：

- ✅ `世界铁路.shp`
- ✅ `世界铁路.shx`
- ✅ `世界铁路.dbf`
- ✅ `世界铁路.prj`

## 🚀 导入数据

### 一键导入（推荐）

```bash
# 从默认路径导入
npx ts-node --project tsconfig.backend.json scripts/import-roads-to-postgis.ts

# 或指定路径
npx ts-node --project tsconfig.backend.json scripts/import-roads-to-postgis.ts \
  --roads data/geographic/roads/roads/世界道路.shp \
  --railways data/geographic/roads/railways/世界铁路.shp
```

## 💻 使用服务

### 基本用法

```typescript
import { GeoFactsRoadService } from './readiness/services/geo-facts-road.service';
import { GeoFactsService } from './readiness/services/geo-facts.service';

// 注入服务
constructor(
  private roadService: GeoFactsRoadService,
  private geoFactsService: GeoFactsService
) {}

// 查询点位道路特征
const roadFeatures = await this.roadService.getRoadFeaturesForPoint(
  64.1283,  // 纬度
  -21.8278, // 经度
  500,      // 靠近道路阈值（米）
  5         // 密度计算缓冲区（公里）
);

console.log(roadFeatures);
// {
//   nearestRoadDistanceM: 120,
//   nearRoad: true,
//   roadDensityScore: 0.65,
//   roadAccessibility: 0.72,
//   primaryRoadType: "highway"
// }

// 查询综合地理特征（河网 + 山脉 + 道路）
const geoFeatures = await this.geoFactsService.getGeoFeaturesForPoint(lat, lng);
console.log(geoFeatures.rivers);    // 河网特征
console.log(geoFeatures.mountains); // 山脉特征
console.log(geoFeatures.roads);     // 道路特征
console.log(geoFeatures.accessibilityScore); // 交通便利性
```

## 🎯 核心特征

| 特征 | 说明 | 用途 |
|------|------|------|
| `nearRoad` | 是否靠近道路（< 500m） | 交通便利性、救援可达性 |
| `roadDensityScore` | 道路密度评分（0-1） | 区域开发程度、交通便利性 |
| `roadAccessibility` | 道路可达性评分（0-1） | 综合交通便利性评估 |
| `primaryRoadType` | 主要道路类型 | 路线规划、交通方式选择 |

## 🔗 与河网、山脉数据结合

使用 `GeoFactsService` 可以同时获取所有地理特征：

```typescript
const geoFeatures = await this.geoFactsService.getGeoFeaturesForPoint(lat, lng);

// 道路少 + 河网密集 + 山脉 → 偏远高风险区域
if (!geoFeatures.roads.nearRoad && 
    geoFeatures.rivers.riverDensityScore > 0.7 &&
    geoFeatures.mountains.inMountain) {
  // 偏远高风险区域
  // - 注意：救援困难、信号差、路线复杂
  // - 建议：准备离线地图、应急方案
}

// 道路密度高 + 河网 → 开发程度高的区域
if (geoFeatures.roads.roadDensityScore > 0.7 &&
    geoFeatures.rivers.riverDensityScore > 0.5) {
  // 开发程度高的区域
  // - 交通便利、基础设施完善
}
```

## 📚 详细文档

- [完整集成指南](../readiness/GEO_DATA_GUIDE.md)
- [数据目录说明](./README.md)
- [文件清单](./FILES_NEEDED.md)

