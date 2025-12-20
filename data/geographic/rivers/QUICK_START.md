# 河网数据快速开始指南

## 🎯 目标

将全球河网数据集成到 TripNARA，提供 4 个核心地理特征用于准备度检查和决策层。

## 📦 数据准备

### 1. 数据文件放置

将你的河网数据按以下结构放置：

```
data/geographic/rivers/
├── rivers_line/              # 线状水系（必需）
│   ├── 世界线状水系.shp
│   ├── 世界线状水系.shx
│   ├── 世界线状水系.dbf
│   └── 世界线状水系.prj      # ⚠️ 必需
├── water_poly/               # 面状水系（必需）
│   ├── 世界面状水系.shp
│   ├── 世界面状水系.shx
│   ├── 世界面状水系.dbf
│   └── 世界面状水系.prj
└── country/                  # 国家边界（可选）
    └── country.*
```

**支持压缩包**：可以打包成 `.zip` 或 `.7z`，解压后保持上述结构。

### 2. 必需文件检查

每个 Shapefile 必须包含 4 个文件：
- ✅ `.shp` - 几何数据
- ✅ `.shx` - 空间索引  
- ✅ `.dbf` - 属性表
- ✅ `.prj` - 坐标系（**非常关键**）

## 🚀 导入数据

### 一键导入（推荐）

```bash
# 从默认路径导入所有数据
ts-node scripts/import-rivers-to-postgis.ts

# 或指定路径
ts-node scripts/import-rivers-to-postgis.ts \
  --rivers-line data/geographic/rivers/rivers_line/世界线状水系.shp \
  --water-poly data/geographic/rivers/water_poly/世界面状水系.shp
```

### 导入后验证

```sql
-- 检查表是否存在
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('geo_rivers_line', 'geo_water_poly');

-- 检查记录数
SELECT COUNT(*) FROM geo_rivers_line;
SELECT COUNT(*) FROM geo_water_poly;

-- 检查空间索引
SELECT indexname FROM pg_indexes 
WHERE tablename IN ('geo_rivers_line', 'geo_water_poly');
```

## 💻 使用服务

### 基本用法

```typescript
import { GeoFactsRiverService } from './readiness/services/geo-facts-river.service';

// 注入服务
constructor(private riverService: GeoFactsRiverService) {}

// 查询点位特征
const features = await this.riverService.getRiverFeaturesForPoint(
  64.1283,  // 纬度
  -21.8278, // 经度
  500,      // 靠近河网阈值（米）
  2,        // 密度计算缓冲区（公里）
  200       // 靠近水域阈值（米）
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

// 查询路线特征
const routeFeatures = await this.riverService.getRiverFeaturesForRoute({
  points: [
    { lat: 64.1283, lng: -21.8278 },
    { lat: 64.1500, lng: -21.8500 },
    // ... 更多点
  ]
});

console.log(routeFeatures.riverCrossingCount); // 路线穿越了几条河流
```

## 🎯 4 个核心特征

| 特征 | 说明 | 用途 |
|------|------|------|
| `nearRiver` | 是否靠近河网（默认 < 500m） | 体验：河谷风景<br>风险：雨季涨水、湿滑 |
| `riverCrossingCount` | 路线穿越河流次数 | 复杂度：桥多/绕行多<br>风险：偏远、需要离线地图 |
| `riverDensityScore` | 河网密度评分（0-1） | 体验：自然探索/摄影<br>风险：湿滑、蚊虫、洪涝 |
| `nearWaterPolygon` | 是否靠近面状水域（默认 < 200m） | 地图表达<br>水边景观推荐 |

## 🔗 集成到 Readiness

在 Readiness Pack 规则中使用：

```typescript
{
  id: 'rule.river.safety.flood-risk',
  when: {
    all: [
      { path: 'geo.nearRiver', eq: true },
      { path: 'itinerary.season', eq: 'rainy' },
    ],
  },
  then: {
    level: 'should',
    message: '路线靠近河网，雨季需注意涨水风险',
  },
}
```

## 📚 详细文档

- [完整集成指南](../readiness/RIVER_DATA_GUIDE.md)
- [数据目录说明](./README.md)
- [Readiness Module README](../readiness/README.md)

## ❓ 常见问题

**Q: 导入时提示 "shp2pgsql 未安装"**  
A: 安装 PostGIS 工具：
```bash
# Ubuntu/Debian
sudo apt-get install postgis

# macOS
brew install postgis
```

**Q: 查询很慢**  
A: 检查空间索引是否创建：
```sql
CREATE INDEX geo_rivers_line_geom_idx ON geo_rivers_line USING GIST (geom);
```

**Q: 坐标系错误**  
A: 确保 `.prj` 文件存在，导入脚本会自动转换坐标系。

