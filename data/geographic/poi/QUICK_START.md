# OSM POI 数据快速开始指南

## 🚀 快速开始

### 斯瓦尔巴（Svalbard）

```bash
# 1. 抓取 POI 数据
npx ts-node --project tsconfig.backend.json scripts/fetch-osm-poi-svalbard.ts

# 2. 导入到数据库
npx ts-node --project tsconfig.backend.json scripts/import-osm-poi-to-postgis.ts

# 3. 规范化处理
npx ts-node --project tsconfig.backend.json scripts/normalize-osm-poi.ts
```

### 格陵兰（Greenland）

```bash
# 1. 抓取 Phase 1 核心城市（默认）
npx ts-node --project tsconfig.backend.json scripts/fetch-osm-poi-greenland.ts

# 或抓取单个城市
npx ts-node --project tsconfig.backend.json scripts/fetch-osm-poi-greenland.ts --city nuuk

# 或抓取所有城市
npx ts-node --project tsconfig.backend.json scripts/fetch-osm-poi-greenland.ts --all

# 2. 导入到数据库
npx ts-node --project tsconfig.backend.json scripts/import-osm-poi-to-postgis.ts --input data/geographic/poi/osm/greenland/raw/all_cities.json

# 3. 规范化处理
npx ts-node --project tsconfig.backend.json scripts/normalize-osm-poi.ts
```

## 📊 数据统计

### 当前数据量

- **斯瓦尔巴**: 64 个 POI
- **格陵兰**: 186 个 POI
  - GL_NUUK: 92 个
  - GL_ILULISSAT: 69 个
  - GL_KANGERLUSSUAQ: 25 个

## 🔍 查询示例

### 按区域查询

```sql
-- 查询格陵兰 Nuuk 的 POI
SELECT * FROM poi_canonical WHERE region_key = 'GL_NUUK';

-- 查询所有格陵兰 POI
SELECT * FROM poi_canonical WHERE region_key LIKE 'GL_%';
```

### 使用服务查询

```typescript
import { GeoFactsPOIService } from './readiness/services/geo-facts-poi.service';

// 查询 Nuuk 的 POI 特征
const poiFeatures = await poiService.getPOIFeaturesForPoint(
  64.1814,  // Nuuk 纬度
  -51.6941, // Nuuk 经度
  50,       // 50km 半径
  3         // Top 3 集合点
);
```

## 📝 注意事项

1. **Overpass 限流**: 脚本已内置串行抓取和等待机制
2. **幂等性**: 支持重复运行，不会产生重复数据
3. **区域标记**: 所有 POI 都有 region_key 标记，便于按区域查询
4. **增量更新**: 支持按 region_key 增量更新

