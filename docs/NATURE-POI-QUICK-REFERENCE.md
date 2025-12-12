# 自然 POI 系统快速参考

## API 端点速查

### 1. 导入数据

```bash
POST /places/nature-poi/import
Content-Type: application/json

{
  "geojson": { ... },
  "source": "iceland_nsi",
  "countryCode": "IS",
  "cityId": 1  // 可选
}
```

### 2. 查询附近的自然 POI

```bash
GET /places/nature-poi/nearby?lat=64.1466&lng=-21.9426&radius=5000&subCategory=volcano
```

### 3. 按类别查询

```bash
GET /places/nature-poi/category/volcano?countryCode=IS&limit=50
```

### 4. 映射为活动

```bash
POST /places/nature-poi/map-to-activity
Content-Type: application/json

{
  "poi": { ... },
  "options": {
    "time": "09:30",
    "template": "shortWalk",
    "language": "zh-CN"
  }
}
```

### 5. 批量映射

```bash
POST /places/nature-poi/batch-map-to-activities
Content-Type: application/json

{
  "pois": [ ... ],
  "options": { ... }
}
```

### 6. 生成 NARA 提示

```bash
POST /places/nature-poi/generate-nara-hints
Content-Type: application/json

{
  "poi": { ... }
}
```

## 命令行工具

### 导入 GeoJSON

```bash
npm run import:nature-poi -- \
  --file ./data/iceland-volcanoes.geojson \
  --source iceland_nsi \
  --country IS \
  --city-id 1
```

## 子类别列表

- `volcano` - 火山
- `lava_field` - 熔岩区
- `geothermal_area` - 地热区
- `hot_spring` - 温泉
- `glacier` - 冰川
- `glacier_lagoon` - 冰川湖
- `waterfall` - 瀑布
- `canyon` - 峡谷
- `crater_lake` - 火山口湖
- `black_sand_beach` - 黑沙滩
- `sea_cliff` - 海崖
- `national_park` - 国家公园
- `nature_reserve` - 自然保护区
- `viewpoint` - 观景点
- `cave` - 洞穴
- `coastline` - 海岸线
- `other` - 其他

## 数据源类型

- `osm` - OpenStreetMap
- `iceland_lmi` - 冰岛土地测量局
- `iceland_nsi` - 冰岛自然历史研究所
- `manual` - 手工维护

## 访问方式

- `drive` - 驾车可达
- `hike` - 需要徒步
- `4x4` - 需要四驱车
- `guided_only` - 仅限跟团
- `boat` - 需要乘船
- `unknown` - 未知

## 徒步难度

- `easy` - 简单
- `moderate` - 中等
- `hard` - 困难
- `expert` - 专家级
- `unknown` - 未知

## 危险等级

- `low` - 低
- `medium` - 中
- `high` - 高
- `extreme` - 极高
- `unknown` - 未知

## 季节

- `spring` - 春季
- `summer` - 夏季
- `autumn` - 秋季
- `winter` - 冬季

## 活动模板

- `photoStop` - 拍照停留（30分钟）
- `shortWalk` - 短途步行（60分钟）
- `halfDayHike` - 半天徒步（180分钟）

## 默认停留时间

| 子类别 | 默认时长（分钟） |
|--------|----------------|
| waterfall, viewpoint, black_sand_beach | 45 |
| glacier_lagoon, national_park | 120 |
| glacier, canyon, cave | 180 |
| volcano, lava_field | 90 |
| geothermal_area, hot_spring | 60 |
| 其他 | 60 |

## 自动标签生成规则

- `waterfall` → `photography`, `water`
- `glacier` → `ice`, `unique-landscape`
- `lava_field` → `geology`, `unique-landscape`
- `volcano` → `geology`, `extreme`
- `accessType: hike` → `hiking`
- `accessType: 4x4` → `adventure`, `off-road`
- `requiresGuide: true` → `guided`

## GeoJSON 必需字段

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [lng, lat]
      },
      "properties": {
        "name": "必需",
        "subCategory": "建议",
        "elevation": "可选",
        "accessType": "可选",
        "trailDifficulty": "可选",
        "hazardLevel": "可选"
      }
    }
  ]
}
```

## 常见问题

### Q: 如何验证 GeoJSON 格式？

A: 系统会自动验证，也可以手动验证：
```typescript
import { validateGeoJSON } from './utils/geojson-validator.util';
const result = validateGeoJSON(geojson);
```

### Q: 如何批量导入多个文件？

A: 使用脚本循环调用导入命令，或合并多个 GeoJSON 文件。

### Q: 数据去重机制？

A: 系统通过 `externalId` 或名称+坐标（100米内）自动去重。

### Q: 如何更新已存在的 POI？

A: 目前需要手动删除后重新导入，或直接更新数据库。

## 相关文档

- [完整实现文档](./NATURE-POI-IMPLEMENTATION.md)
- [数据源获取指南](./ICELAND-DATA-SOURCE-GUIDE.md)
- [示例 GeoJSON](../data/examples/iceland-volcano-example.geojson)
