# 河网数据集成指南

## 📋 概述

本文档说明如何将全球河网数据集成到 TripNARA 系统中，并用于准备度检查和决策层。

## 🗂️ 数据准备

### 1. 数据文件结构

将河网数据按以下结构放置：

```
data/geographic/rivers/
├── rivers_line/              # 线状水系
│   ├── 世界线状水系.shp
│   ├── 世界线状水系.shx
│   ├── 世界线状水系.dbf
│   └── 世界线状水系.prj      # ⚠️ 必需：坐标系定义
├── water_poly/               # 面状水系
│   ├── 世界面状水系.shp
│   ├── 世界面状水系.shx
│   ├── 世界面状水系.dbf
│   └── 世界面状水系.prj
└── country/                  # 国家边界（可选）
    ├── country.shp
    ├── country.shx
    ├── country.dbf
    └── country.prj
```

### 2. 必需文件

每个 Shapefile 必须包含：
- `.shp` - 几何数据
- `.shx` - 空间索引
- `.dbf` - 属性表
- `.prj` - 坐标系定义（**非常关键**）

### 3. 压缩格式

支持 `.zip` 或 `.7z` 压缩包，压缩包内保持上述目录结构。

## 🚀 数据导入

### 方法 1：使用导入脚本（推荐）

```bash
# 导入所有数据（从默认路径）
ts-node scripts/import-rivers-to-postgis.ts

# 指定路径导入
ts-node scripts/import-rivers-to-postgis.ts \
  --rivers-line data/geographic/rivers/rivers_line/世界线状水系.shp \
  --water-poly data/geographic/rivers/water_poly/世界面状水系.shp \
  --country data/geographic/rivers/country/country.shp

# 删除现有表后重新导入
ts-node scripts/import-rivers-to-postgis.ts --drop-existing
```

### 方法 2：手动使用 shp2pgsql

```bash
# 导入线状水系
shp2pgsql -s 4326 -I -W UTF-8 \
  data/geographic/rivers/rivers_line/世界线状水系.shp \
  geo_rivers_line | psql -d your_database

# 导入面状水系
shp2pgsql -s 4326 -I -W UTF-8 \
  data/geographic/rivers/water_poly/世界面状水系.shp \
  geo_water_poly | psql -d your_database
```

### 导入后的表结构

导入脚本会创建以下 PostGIS 表：

- `geo_rivers_line` - 线状水系（LINESTRING）
- `geo_water_poly` - 面状水系（POLYGON）
- `geo_country` - 国家边界（POLYGON）

每个表都包含：
- `geom` - PostGIS 几何列（带空间索引）
- 原始 Shapefile 的所有属性字段（从 `.dbf` 读取）

## 🔧 使用 GeoFactsRiverService

### 基本用法

```typescript
import { GeoFactsRiverService } from './readiness/services/geo-facts-river.service';

@Injectable()
export class YourService {
  constructor(
    private readonly riverService: GeoFactsRiverService
  ) {}

  // 获取点位的河网特征
  async checkPoint(lat: number, lng: number) {
    const features = await this.riverService.getRiverFeaturesForPoint(
      lat,
      lng,
      500,  // 靠近河网阈值（米）
      2,    // 密度计算缓冲区（公里）
      200   // 靠近水域阈值（米）
    );

    console.log(features);
    // {
    //   nearestRiverDistanceM: 180,
    //   nearRiver: true,
    //   riverCrossingCount: 0,
    //   riverDensityScore: 0.73,
    //   nearWaterPolygon: false,
    //   nearestWaterPolygonDistanceM: 350
    // }
  }

  // 获取路线的河网特征
  async checkRoute(points: Array<{ lat: number; lng: number }>) {
    const features = await this.riverService.getRiverFeaturesForRoute({
      points: points
    });

    console.log(features);
    // {
    //   nearestRiverDistanceM: 120,
    //   nearRiver: true,
    //   riverCrossingCount: 3,  // 路线穿越了3条河流
    //   riverDensityScore: 0.85,
    //   nearWaterPolygon: true,
    //   nearestWaterPolygonDistanceM: 150
    // }
  }
}
```

### 4 个核心特征说明

#### 1. `nearRiver` - 靠近河网

**定义**：点位到最近河线的距离是否小于阈值（默认 500m）

**用途**：
- 体验：河谷风景、摄影"水边氛围"
- 风险：雨季/暴雨提示滑倒、涨水风险

**示例规则**：
```typescript
if (features.nearRiver && season === 'rainy') {
  // 提醒：涨水风险、湿滑路面
}
```

#### 2. `riverCrossingCount` - 穿越河流次数

**定义**：路线 polyline 与河线相交次数（去重：按河段 id）

**用途**：
- 自驾/徒步复杂度：桥多/绕行多/偏远风险更高
- 规则触发：需要 buffer、避免夜间、准备离线地图等

**示例规则**：
```typescript
if (features.riverCrossingCount > 5 && transportMode === 'self_drive') {
  // 提醒：避免夜间长途、加 buffer、准备离线地图
}
```

#### 3. `riverDensityScore` - 河网密度评分

**定义**：在路线或景点周边 buffer（默认 2km）内，河线总长度归一化评分（0-1）

**用途**：
- 体验：水系丰富地区更适合"自然探索/摄影"
- 风险：湿滑、蚊虫、低洼洪涝敏感（结合天气/季节）

**示例规则**：
```typescript
if (features.riverDensityScore > 0.7 && activity === 'hiking') {
  // 提醒：防滑装备、防蚊虫、注意低洼路段
}
```

#### 4. `nearWaterPolygon` - 靠近面状水域

**定义**：点到水域面的距离是否小于阈值（默认 200m）

**用途**：
- 地图表达更真实
- 水边景观推荐更准确（有些地方河线不明显，但水面很大）

**示例规则**：
```typescript
if (features.nearWaterPolygon) {
  // 推荐：水边景观、摄影点
}
```

## 🔗 集成到 Readiness 模块

### 在 Readiness Pack 规则中使用

```typescript
// 在 readiness pack 的规则中
{
  id: 'rule.river.safety.flood-risk',
  category: 'safety_hazards',
  severity: 'high',
  when: {
    all: [
      { path: 'geo.nearRiver', eq: true },
      { path: 'itinerary.season', eq: 'rainy' },
    ],
  },
  then: {
    level: 'should',
    message: '路线靠近河网，雨季需注意涨水风险',
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
  geoFeatures: RiverFeatures
): Promise<ReadinessFinding> {
  // 结合地理特征和国家事实生成准备度检查结果
  // ...
}
```

## 🎯 集成到决策层（Abu/Dr.Dre/Neptune）

### 在约束编译器中添加河网约束

```typescript
// 在 readiness-to-constraints.compiler.ts 中
compileRiverConstraints(features: RiverFeatures): Constraint[] {
  const constraints: Constraint[] = [];

  // 高穿越次数 → 避免夜间长途
  if (features.riverCrossingCount > 5) {
    constraints.push({
      type: 'soft',
      severity: 'warning',
      message: '路线穿越多条河流，建议避免夜间长途',
      condition: (candidate) => {
        // 检查是否为夜间长途
        return candidate.startTime && isNightTime(candidate.startTime);
      },
    });
  }

  // 高河网密度 + 雨季 → 湿滑风险
  if (features.riverDensityScore > 0.7 && season === 'rainy') {
    constraints.push({
      type: 'soft',
      severity: 'warning',
      message: '河网密集区域，雨季需注意湿滑路面',
    });
  }

  return constraints;
}
```

## 📊 性能优化建议

1. **空间索引**：确保 `geo_rivers_line` 和 `geo_water_poly` 表的 `geom` 列已创建 GIST 索引
2. **数据裁剪**：如果数据量很大，可以按国家/区域裁剪后再导入
3. **缓存**：对于频繁查询的点位，可以缓存 `RiverFeatures` 结果

## 🐛 故障排查

### 问题：表不存在

**错误**：`relation "geo_rivers_line" does not exist`

**解决**：运行导入脚本导入数据

```bash
ts-node scripts/import-rivers-to-postgis.ts
```

### 问题：坐标系错误

**错误**：查询结果距离不准确

**解决**：
1. 检查 `.prj` 文件是否存在
2. 确认导入时使用了正确的 SRID（默认 4326）
3. 如果源数据不是 4326，导入脚本会自动转换

### 问题：查询很慢

**解决**：
1. 检查空间索引是否创建：
   ```sql
   SELECT indexname FROM pg_indexes WHERE tablename = 'geo_rivers_line';
   ```
2. 如果没有索引，手动创建：
   ```sql
   CREATE INDEX geo_rivers_line_geom_idx ON geo_rivers_line USING GIST (geom);
   ```

## 📚 相关文档

- [Readiness Module README](./README.md)
- [数据存放目录说明](../../../data/geographic/rivers/README.md)
- [PostGIS 官方文档](https://postgis.net/documentation/)

