# 山脉数据快速开始指南

## 📋 需要哪些文件？

### ✅ 必需文件（用于 PostGIS 导入）

从你的 `C7全球山脉数据库` 文件夹中，需要以下 **Shapefile 文件**：

#### 推荐：标准版本（`GMBA_Inventory_v2.0_standard`）

**必需文件**（放在 `data/geographic/mountains/inventory_standard/` 目录下）：
- ✅ `GMBA_Inventory_v2.0_standard.shp` - 几何数据
- ✅ `GMBA_Inventory_v2.0_standard.shx` - 空间索引
- ✅ `GMBA_Inventory_v2.0_standard.dbf` - 属性表（包含海拔等信息）
- ✅ `GMBA_Inventory_v2.0_standard.prj` - 坐标系定义（**非常关键**）

**可选文件**：
- `.sbn/.sbx` - 空间索引（有的话查询更快）
- `.shp.xml` - 元数据
- `.CPG` - 编码文件

#### 可选：300米分辨率版本（`GMBA_Inventory_v2.0_standard_300`）

如果需要更高精度，也可以导入 300 米版本（放在 `inventory_standard_300/` 目录下）。

#### 可选：宽泛版本（`GMBA_Inventory_v2.0_broad`）

如果需要快速查询，可以导入宽泛版本（放在 `inventory_broad/` 目录下）。

### ❌ 不需要的文件

- `GMBA_Definition_v2.0.tif` - 栅格文件，PostGIS 主要处理矢量数据，暂不需要

## 📁 文件放置位置

将文件按以下结构放置：

```
data/geographic/mountains/
├── inventory_standard/
│   ├── GMBA_Inventory_v2.0_standard.shp
│   ├── GMBA_Inventory_v2.0_standard.shx
│   ├── GMBA_Inventory_v2.0_standard.dbf
│   └── GMBA_Inventory_v2.0_standard.prj      # ⚠️ 必需
├── inventory_standard_300/                  # 可选
│   └── GMBA_Inventory_v2.0_standard_300.*
└── inventory_broad/                          # 可选
    └── GMBA_Inventory_v2.0_broad.*
```

## 🚀 导入数据

### 一键导入（推荐）

```bash
# 从默认路径导入标准版本
npx ts-node --project tsconfig.backend.json scripts/import-mountains-to-postgis.ts

# 或指定路径
npx ts-node --project tsconfig.backend.json scripts/import-mountains-to-postgis.ts \
  --standard data/geographic/mountains/inventory_standard/GMBA_Inventory_v2.0_standard.shp
```

### 导入多个版本

```bash
# 导入标准版本和 300 米版本
npx ts-node --project tsconfig.backend.json scripts/import-mountains-to-postgis.ts \
  --standard data/geographic/mountains/inventory_standard/GMBA_Inventory_v2.0_standard.shp \
  --standard-300 data/geographic/mountains/inventory_standard_300/GMBA_Inventory_v2.0_standard_300.shp
```

## 💻 使用服务

### 基本用法

```typescript
import { GeoFactsMountainService } from './readiness/services/geo-facts-mountain.service';
import { GeoFactsService } from './readiness/services/geo-facts.service';

// 注入服务
constructor(
  private mountainService: GeoFactsMountainService,
  private geoFactsService: GeoFactsService
) {}

// 查询点位山脉特征
const features = await this.mountainService.getMountainFeaturesForPoint(
  64.1283,  // 纬度
  -21.8278, // 经度
  5         // 密度计算缓冲区（公里）
);

console.log(features);
// {
//   inMountain: true,
//   mountainElevationAvg: 1200,
//   mountainElevationMax: 1500,
//   mountainElevationMin: 800,
//   mountainDensityScore: 0.65,
//   terrainComplexity: 0.72,
//   nearestMountainDistanceM: 0
// }

// 查询综合地理特征（河网 + 山脉）
const geoFeatures = await this.geoFactsService.getGeoFeaturesForPoint(lat, lng);
console.log(geoFeatures.rivers);    // 河网特征
console.log(geoFeatures.mountains);  // 山脉特征
console.log(geoFeatures.terrainComplexity); // 综合地形复杂度
console.log(geoFeatures.riskScore);   // 综合风险评分
```

## 🎯 核心特征

| 特征 | 说明 | 用途 |
|------|------|------|
| `inMountain` | 是否在山脉区域内 | 地形识别、路线规划 |
| `mountainElevationAvg/Max/Min` | 山脉海拔信息 | 高反风险评估、难度评估 |
| `mountainDensityScore` | 山脉密度评分（0-1） | 地形复杂度、路线选择 |
| `terrainComplexity` | 地形复杂度评分（0-1） | 综合难度评估 |

## 🔗 与河网数据结合

使用 `GeoFactsService` 可以同时获取河网和山脉特征：

```typescript
const geoFeatures = await this.geoFactsService.getGeoFeaturesForPoint(lat, lng);

// 高海拔 + 河网密集 → 峡谷/河谷地形
if (geoFeatures.mountains.inMountain && 
    geoFeatures.mountains.mountainElevationMax > 2000 &&
    geoFeatures.rivers.riverDensityScore > 0.7) {
  // 峡谷地形，注意山洪风险
}

// 山脉 + 雨季 → 山洪/滑坡风险
if (geoFeatures.mountains.inMountain && season === 'rainy') {
  // 提醒：山洪、滑坡风险
}
```

## 📚 详细文档

- [完整集成指南](../readiness/GEO_DATA_GUIDE.md)
- [数据目录说明](./README.md)
- [河网数据指南](../rivers/README.md)

