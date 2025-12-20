# 海岸线数据快速开始指南

## 📋 需要哪些文件？

### ✅ 必需：海岸线数据

**从你的海岸线数据文件夹复制以下文件到 `data/geographic/coastlines/`：**

- ✅ `lines.shp` - 几何数据
- ✅ `lines.shx` - 空间索引
- ✅ `lines.dbf` - 属性表
- ✅ `lines.prj` - 坐标系定义（**非常关键**）

## 🚀 导入数据

### 一键导入（推荐）

```bash
# 从默认路径导入
npx ts-node --project tsconfig.backend.json scripts/import-coastlines-to-postgis.ts

# 或指定路径
npx ts-node --project tsconfig.backend.json scripts/import-coastlines-to-postgis.ts \
  --coastlines data/geographic/coastlines/lines.shp
```

## 💻 使用服务

### 基本用法

```typescript
import { GeoFactsCoastlineService } from './readiness/services/geo-facts-coastline.service';
import { GeoFactsService } from './readiness/services/geo-facts.service';

// 注入服务
constructor(
  private coastlineService: GeoFactsCoastlineService,
  private geoFactsService: GeoFactsService
) {}

// 查询点位海岸线特征
const coastlineFeatures = await this.coastlineService.getCoastlineFeaturesForPoint(
  64.1283,  // 纬度
  -21.8278, // 经度
  5,        // 靠近海岸线阈值（公里）
  50,       // 沿海区域阈值（公里）
  10        // 密度计算缓冲区（公里）
);

console.log(coastlineFeatures);
// {
//   nearestCoastlineDistanceM: 3200,
//   nearCoastline: true,
//   isCoastalArea: true,
//   coastlineDensityScore: 0.45
// }

// 查询综合地理特征（河网 + 山脉 + 道路 + 海岸线）
const geoFeatures = await this.geoFactsService.getGeoFeaturesForPoint(lat, lng);
console.log(geoFeatures.rivers);     // 河网特征
console.log(geoFeatures.mountains);   // 山脉特征
console.log(geoFeatures.roads);       // 道路特征
console.log(geoFeatures.coastlines);  // 海岸线特征
```

## 🎯 核心特征

| 特征 | 说明 | 用途 |
|------|------|------|
| `nearCoastline` | 是否靠近海岸线（< 5km） | 海岸景观、海浪风险 |
| `isCoastalArea` | 是否在沿海区域（< 50km） | 沿海地区识别、气候特征 |
| `coastlineDensityScore` | 海岸线密度评分（0-1） | 海岸复杂度、景观丰富度 |
| `nearestCoastlineDistanceM` | 到最近海岸线的距离（米） | 精确距离计算 |

## 🔗 与河网、山脉、道路数据结合

使用 `GeoFactsService` 可以同时获取所有地理特征：

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

## 📚 详细文档

- [完整集成指南](../readiness/GEO_DATA_GUIDE.md)
- [数据目录说明](./README.md)
- [文件清单](./FILES_NEEDED.md)

