# 冰岛自然 POI 系统实现文档

## 概述

本系统实现了从冰岛官方地理数据源导入自然 POI（Point of Interest）的功能，支持将火山、冰川、瀑布等自然景点数据导入数据库，并映射为行程活动。

## 架构设计

### 数据源

系统支持三种数据源：

1. **OSM (OpenStreetMap)**: 城市点位（教堂、博物馆、餐厅、观景台等）
2. **iceland_lmi**: 冰岛土地测量局（Landmælingar Íslands）数据
3. **iceland_nsi**: 冰岛自然历史研究所（Náttúrufræðistofnun Íslands）数据
4. **manual**: 手工维护的标志性体验点

### 核心组件

#### 1. 类型定义 (`src/places/interfaces/nature-poi.interface.ts`)

- `BasePoi`: 基础 POI 结构
- `IcelandNaturePoi`: 冰岛自然 POI 扩展（包含海拔、季节、难度等）
- `NaraHint`: LLM 提示信息（叙事种子、行动提示等）
- `TimeSlotActivity`: 活动时间片结构

#### 2. 服务层

- **NaturePoiService**: 自然 POI 的导入、查询、转换
- **NaturePoiMapperService**: 将自然 POI 映射为活动时间片

#### 3. API 端点

- `POST /places/nature-poi/import`: 从 GeoJSON 导入
- `GET /places/nature-poi/nearby`: 查找附近的自然 POI
- `GET /places/nature-poi/category/:subCategory`: 按类别查找
- `POST /places/nature-poi/map-to-activity`: 映射为活动

## 使用指南

### 1. 准备 GeoJSON 数据

从冰岛官方数据源下载数据后，需要转换为 GeoJSON 格式。示例结构：

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [-21.9426, 64.1466]
      },
      "properties": {
        "name": "Hallgrímskirkja",
        "name_en": "Hallgrimskirkja",
        "name_zh": "哈尔格林姆斯大教堂",
        "subCategory": "volcano",
        "elevation": 1200,
        "accessType": "drive",
        "trailDifficulty": "easy",
        "bestSeasons": ["summer", "autumn"],
        "hazardLevel": "low",
        "lastEruptionYear": 2021,
        "isActiveVolcano": true
      }
    }
  ]
}
```

### 2. 使用命令行导入

```bash
# 导入火山数据
npm run import:nature-poi -- \
  --file ./data/iceland-volcanoes.geojson \
  --source iceland_nsi \
  --country IS

# 导入冰川数据
npm run import:nature-poi -- \
  --file ./data/iceland-glaciers.geojson \
  --source iceland_lmi \
  --country IS \
  --city-id 1
```

### 3. 使用 API 导入

```bash
curl -X POST http://localhost:3000/places/nature-poi/import \
  -H "Content-Type: application/json" \
  -d '{
    "geojson": {
      "type": "FeatureCollection",
      "features": [...]
    },
    "source": "iceland_nsi",
    "countryCode": "IS"
  }'
```

### 4. 查询自然 POI

```bash
# 查找附近的自然 POI
curl "http://localhost:3000/places/nature-poi/nearby?lat=64.1466&lng=-21.9426&radius=5000"

# 按类别查找
curl "http://localhost:3000/places/nature-poi/category/volcano?countryCode=IS&limit=50"
```

### 5. 映射为活动

```bash
curl -X POST http://localhost:3000/places/nature-poi/map-to-activity \
  -H "Content-Type: application/json" \
  -d '{
    "poi": {
      "id": "uuid",
      "name": { "primary": "Eyjafjallajökull", "en": "Eyjafjallajökull" },
      "subCategory": "volcano",
      "coordinates": { "lat": 63.63, "lng": -19.62 }
    },
    "options": {
      "time": "09:30",
      "template": "shortWalk",
      "language": "zh-CN"
    }
  }'
```

## 数据字段说明

### 必需字段

- `name`: 名称（primary 必需）
- `coordinates`: 坐标（lat, lng）
- `subCategory`: 子类别（见下方列表）

### 可选字段

- `elevationMeters`: 海拔（米）
- `typicalStay`: 建议停留时间（分钟）
- `bestSeasons`: 最佳季节（spring/summer/autumn/winter）
- `bestTimeOfDay`: 最佳时间段（sunrise/morning/noon/afternoon/sunset/night）
- `accessType`: 访问方式（drive/hike/4x4/guided_only/boat/unknown）
- `trailDifficulty`: 徒步难度（easy/moderate/hard/expert/unknown）
- `requiresGuide`: 是否需要向导（boolean）
- `hazardLevel`: 危险等级（low/medium/high/extreme/unknown）
- `safetyNotes`: 安全提示（字符串数组）
- `lastEruptionYear`: 最后喷发年份（火山用）
- `isActiveVolcano`: 是否为活火山（boolean）
- `protectedAreaName`: 保护区名称

### 子类别列表

- `volcano`: 火山
- `lava_field`: 熔岩区
- `geothermal_area`: 地热区
- `hot_spring`: 温泉
- `glacier`: 冰川
- `glacier_lagoon`: 冰川湖
- `waterfall`: 瀑布
- `canyon`: 峡谷
- `crater_lake`: 火山口湖
- `black_sand_beach`: 黑沙滩
- `sea_cliff`: 海崖
- `national_park`: 国家公园
- `nature_reserve`: 自然保护区
- `viewpoint`: 观景点
- `cave`: 洞穴
- `coastline`: 海岸线
- `other`: 其他

## 映射规则

### 子类别 → 活动类型

- `volcano`, `lava_field`, `geothermal_area`, `glacier`, `waterfall` → `nature`
- `black_sand_beach`, `sea_cliff`, `coastline` → `coastal`
- `national_park`, `nature_reserve` → `nature_park`
- `viewpoint` → `viewpoint`
- `cave` → `explore`

### 默认停留时间

- `waterfall`, `viewpoint`, `black_sand_beach`: 45 分钟
- `glacier_lagoon`, `national_park`: 120 分钟
- `glacier`, `canyon`, `cave`: 180 分钟
- `volcano`, `lava_field`: 90 分钟
- `geothermal_area`, `hot_spring`: 60 分钟

### 自动标签生成

根据子类别和属性自动生成标签：

- `waterfall` → `photography`, `water`
- `glacier` → `ice`, `unique-landscape`
- `lava_field` → `geology`, `unique-landscape`
- `volcano` → `geology`, `extreme`
- `accessType: hike` → `hiking`
- `accessType: 4x4` → `adventure`, `off-road`
- `requiresGuide: true` → `guided`

## 安全提示

系统会根据 POI 属性自动生成安全提示：

- **瀑布**: "可准备防水外套，靠近瀑布区域水汽较大。"
- **熔岩区**: "地表可能不平整，建议穿防滑登山鞋，避免踩在松动岩块上。"
- **冰川**: "注意保暖，冰川区域温度较低，建议穿着防滑鞋。"
- **地热区**: "地热区域地面可能较薄，请按指定路线行走，注意安全。"
- **活火山**: "这是活火山，请关注官方安全提示。"
- **高危险等级**: "⚠️ 注意安全提示，有危险区域请勿擅自进入。"

## 数据来源获取指南

### 冰岛土地测量局 (Landmælingar Íslands)

1. 访问 [Landupplýsingagátt](https://www.lmi.is/) 地理信息门户
2. 搜索关键字：DEM, Administrative boundaries, Place names
3. 下载 GeoJSON 或 Shapefile 格式数据
4. 如需要，使用 QGIS 转换为 GeoJSON

### 冰岛自然历史研究所 (Náttúrufræðistofnun Íslands)

1. 访问 [官网](https://www.ni.is/)
2. 进入 Resources → Geospatial data / Open data
3. 下载火山活动、地质图、土地覆盖等数据
4. 使用 QGIS 处理并导出为 GeoJSON

### 数据处理步骤（QGIS）

1. 打开 Shapefile/GeoPackage
2. 统一坐标系为 WGS84 (EPSG:4326)
3. 如果是多边形，使用 "Polygon centroids" 生成中心点
4. 筛选并重命名字段
5. 导出为 GeoJSON

## 与行程系统集成

自然 POI 可以自动映射为 `ItineraryItem`：

```typescript
// 在行程生成服务中使用
const naturePois = await naturePoiService.findNaturePoisByArea(
  { lat: 64.1466, lng: -21.9426 },
  5000,
  'volcano'
);

const activities = naturePoiMapperService.mapMultiplePoisToActivities(
  naturePois,
  { time: '09:30', language: 'zh-CN' }
);

// 创建 ItineraryItem
for (const activity of activities) {
  await itineraryItemsService.create({
    tripDayId: dayId,
    type: 'ACTIVITY',
    startTime: parseTime(activity.time),
    endTime: addMinutes(parseTime(activity.time), activity.durationMinutes),
    placeId: poiPlaceId,
    note: activity.notes,
  });
}
```

## 注意事项

1. **坐标系统**: 所有数据必须使用 WGS84 (EPSG:4326)
2. **去重机制**: 系统通过 `externalId` 或名称+坐标（100米内）自动去重
3. **性能**: 批量导入时建议分批处理，避免一次性导入过多数据
4. **数据质量**: 建议在导入前验证 GeoJSON 格式和必需字段
5. **安全提示**: 危险等级高的 POI 会自动添加安全提示

## 未来扩展

- [ ] 支持 NARA 提示信息的自动生成
- [ ] 支持从多个数据源合并 POI
- [ ] 支持 POI 的编辑和更新
- [ ] 支持 POI 的评分和评论
- [ ] 支持 POI 的图片和视频关联
