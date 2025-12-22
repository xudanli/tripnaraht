# POI 数据集成总结

## 🌍 全球 POI 数据概览

本文档总结了 TripNARA 系统中所有已集成的 OSM POI 数据。

## 📊 数据覆盖

### 已集成的国家/地区

| 国家/地区 | 区域数 | POI 数 | 状态 |
|----------|--------|--------|------|
| **挪威** | 14 | 120,255 | ✅ 全部完成 |
| **冰岛** | 14 | 12,812 | ✅ 全部完成 |
| **格陵兰** | 6 | 352 | ✅ 完成 |
| **斯瓦尔巴** | 1 | 64 | ✅ 完成 |
| **总计** | **35** | **133,483** | ✅ **全部完成** |

### 区域详情

#### 🇳🇴 挪威（14 个区域）

**Phase 1（MVP）**:
- NO_OSLO: 37,691 个
- NO_BERGEN: 18,541 个
- NO_STAVANGER: 9,896 个
- NO_TRONDHEIM: 9,786 个
- NO_ALESUND: 1,333 个
- NO_BODO: 2,481 个
- NO_TROMSO: 376 个
- NO_LOFOTEN: 5,033 个

**Phase 2（增强）**:
- NO_GEIRANGER: 12,744 个
- NO_FLAM: 5,014 个
- NO_TROLLSTIGEN: 4,022 个
- NO_ATLANTIC_ROAD: 304 个
- NO_SENJA: 11,533 个
- NO_NORTH_CAPE: 1,501 个

#### 🇮🇸 冰岛（14 个区域）

**Phase 1（MVP）**:
- IS_REYKJAVIK: 7,737 个
- IS_GOLDEN_CIRCLE: 1,455 个
- IS_AKUREYRI: 1,078 个
- IS_EGILSSTADIR: 782 个
- IS_SOUTH_COAST: 552 个
- IS_SNAEFELLSNES: 544 个
- IS_HUSAVIK: 266 个
- IS_HOFN: 249 个
- IS_KEFLAVIK_AIRPORT: 28 个

**Phase 2（增强）**:
- IS_LANDMANNALAUGAR: 485 个
- IS_THORSMORK: 273 个
- IS_KERLINGARFJOLL: 132 个
- IS_ASKJA: 145 个

#### 🇬🇱 格陵兰（6 个城市）

- GL_NUUK: 92 个
- GL_ILULISSAT: 69 个
- GL_SISIMIUT: 56 个
- GL_AASIAAT: 62 个
- GL_TASIILAQ: 48 个
- GL_KANGERLUSSUAQ: 25 个

#### 🇸🇯 斯瓦尔巴（1 个区域）

- SV_LONGYEARBYEN: 64 个

## 🏷️ 分类体系

### 通用分类

- **PARKING**: 停车点
- **TRANSIT**: 公共交通
- **INFORMATION**: 信息点
- **VIEWPOINT**: 观景点
- **SUPPLY**: 补给点（超市/便利店）
- **FUEL**: 加油站
- **TOILETS**: 厕所
- **FACILITY**: 设施（避难所等）
- **HOSPITAL**: 医院
- **PHARMACY**: 药房
- **SAFETY**: 安全点（警察/消防）
- **AIRPORT**: 机场
- **HARBOUR**: 港区
- **CAMPING**: 露营地
- **TRAILHEAD**: 徒步入口
- **ATTRACTION**: 景点
- **ATTRACTION_NATURE**: 自然景点（瀑布/地热/冰川等）

### 地区特有分类

#### 挪威特有

- **FERRY_TERMINAL**: 渡轮码头（570 个）
- **PIER_DOCK**: 栈桥/码头（11,457 个）
- **EV_CHARGER**: 充电桩（1,499 个）
- **RAILWAY_STATION**: 火车站（230 个）
- **TOLL**: 收费站（176 个）
- **CABIN**: 小屋（61 个）

#### 冰岛特有

- **SPA_POOL**: 地热池/泳池（297 个）

## 📁 数据文件位置

### 挪威
- `data/geographic/poi/osm/norway/raw/`
- 脚本: `scripts/fetch-osm-poi-norway.ts`

### 冰岛
- `data/geographic/poi/osm/iceland/raw/`
- 脚本: `scripts/fetch-osm-poi-iceland.ts`

### 格陵兰
- `data/geographic/poi/osm/greenland/raw/`
- 脚本: `scripts/fetch-osm-poi-greenland.ts`

### 斯瓦尔巴
- `data/geographic/poi/osm/svalbard/raw/`
- 脚本: `scripts/fetch-osm-poi-svalbard.ts`

## 🔄 数据流程

1. **抓取**: 使用 Overpass API 从 OSM 抓取 POI 数据
2. **导入**: 导入到 `poi_osm_raw` 表（原始数据）
3. **规范化**: 规范化到 `poi_canonical` 表（业务数据）
4. **使用**: 通过 `GeoFactsPOIService` 提供地理特征

## 🎯 使用场景

### 地理特征提取

- `GeoFactsPOIService`: 统一的地理特征服务
- `POIPickupScorerService`: 识别集合点（特别是渡轮码头）
- `POITrailheadService`: 识别徒步入口

### Readiness 规则

- **渡轮依赖日**: FERRY_TERMINAL 命中 + 路线跨海
- **冬季山口自驾**: 日程含山地 + 月份 11–3
- **极北极光活动**: Tromsø/Lofoten/North Cape
- **徒步入口**: trailhead/cabin 命中

## 📝 维护建议

1. **定期更新**: 建议每季度重新抓取一次，获取最新 OSM 数据
2. **增量更新**: 支持按 `region_key` 增量更新，不会产生重复数据
3. **错误处理**: 如果某个区域抓取失败，可以单独重试
4. **限流保护**: 已内置串行抓取和等待机制，避免 Overpass API 限流

## 🔗 相关文档

- [Place vs POI 区别](./PLACE_VS_POI.md)
- [OSM POI 集成指南](../src/trips/readiness/OSM_POI_INTEGRATION.md)
- [地理数据指南](../src/trips/readiness/GEO_DATA_GUIDE.md)

