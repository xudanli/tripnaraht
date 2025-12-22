# OSM POI 数据底座

## 📋 概述

基于 OpenStreetMap (OSM) 数据构建 TripNARA 的 POI（兴趣点）底座，以斯瓦尔巴（Longyearbyen）为核心场景。

## 🎯 设计原则

**不在"多"，在"关键点能否把行程跑通"**

优先覆盖：
1. **出海/交通节点**（决定可执行）
2. **安全保障点**（安全与补给）
3. **玩法入口点**（让 agent 不会泛泛而谈）

## 📁 目录结构

```
data/geographic/poi/
├── osm/                    # OSM 数据
│   └── svalbard/          # 斯瓦尔巴数据
│       ├── raw/           # 原始 OSM 数据（JSON）
│       └── processed/     # 处理后的数据
└── README.md              # 本文档
```

## 🔍 POI 优先级分类

### A. 出海/交通节点（决定可执行）

- **码头/渡轮/栈桥**：
  - `amenity=ferry_terminal` - 上下船地点
  - `man_made=pier` - 栈桥/码头结构
  
- **游艇码头/停泊区**：
  - `leisure=marina`
  - `landuse=harbour`
  - `water=harbour`
  - `harbour=*`

- **机场**：
  - `aeroway=aerodrome`
  - `aeroway=terminal`

### B. 安全保障点（安全与补给）

- **医疗**：`amenity=hospital|clinic|pharmacy`
- **救援**：`amenity=police|fire_station`
- **加油站**：`amenity=fuel`
- **补给**：`shop=supermarket|convenience`
- **厕所/避难点**：`amenity=toilets`、`shelter=*`

### C. 玩法入口点（让 agent 不会泛泛而谈）

- **徒步入口**：`highway=trailhead`
- **游客中心/信息板**：`tourism=information` + `information=office|map|board`
- **观景点**：`tourism=viewpoint`
- **户外装备/租赁/旅行社**：
  - `shop=outdoor`
  - `amenity=boat_rental`
  - `office=tourism`
  - `tourism=agency`

## 🚀 快速开始

### 1. 抓取 OSM 数据

```bash
# 使用 Overpass API 抓取斯瓦尔巴 POI
npx ts-node --project tsconfig.backend.json scripts/fetch-osm-poi-svalbard.ts
```

### 2. 导入到数据库

```bash
# 导入原始 OSM 数据
npx ts-node --project tsconfig.backend.json scripts/import-osm-poi-to-postgis.ts
```

### 3. 规范化处理

```bash
# 将 OSM 数据规范化为业务 POI
npx ts-node --project tsconfig.backend.json scripts/normalize-osm-poi.ts
```

## 📊 数据库 Schema

### 原始表（保真，证据层）

`poi_osm_raw`:
- `osm_type` (node/way/relation)
- `osm_id`
- `geom` (POINT)
- `tags` (JSONB)
- `timestamp` / `version`

### 规范表（业务层）

`poi_canonical`:
- `poi_id` (UUID)
- `source="OSM"`
- `source_key` (node:123|way:456|relation:789)
- `name_default`
- `name_i18n` (json)
- `category` (PORT / PICKUP_POINT / TRAILHEAD / SAFETY / FOOD / ...)
- `lat/lng`
- `address`
- `opening_hours`
- `phone`
- `website`
- `tags_slim` (关键 tag)
- `fetched_at`

## 🔗 相关文档

- [斯瓦尔巴 POI 抓取指南](./osm/svalbard/README.md)
- [集合点评分算法](./docs/PICKUP_POINT_SCORING.md)
- [徒步入口识别](./docs/TRAILHEAD_IDENTIFICATION.md)

