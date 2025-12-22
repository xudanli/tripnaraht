# 西藏 POI 数据

## 概述

西藏 POI 数据抓取和集成方案，针对西藏特殊的地理和旅行需求。

## 核心差异

与欧洲目的地不同，西藏的关键关注点是：
- **高海拔安全**（必须）
- **补给点稀疏**（must）
- **检查站/边防限制**（should/must）
- **路况封闭**（冬季/夜间 must）

## 区域配置

### Phase 1: MVP（8 个区域）

1. **CN_XZ_LHASA** - 拉萨（50km）
2. **CN_XZ_NYINGCHI** - 林芝（50km）
3. **CN_XZ_SHIGATSE** - 日喀则（50km）
4. **CN_XZ_GYANTSE** - 江孜（50km）
5. **CN_XZ_TINGRI_EBC** - 定日/珠峰大本营入口（120km）
6. **CN_XZ_NAGQU** - 那曲（50km）
7. **CN_XZ_ALI_SHIQUANHE** - 狮泉河/阿里（200km）
8. **CN_XZ_CHAMDO** - 昌都（50km）

## 快速开始

### 0. 数据库迁移（首次使用）

```bash
# 添加 altitude_hint 字段到 poi_canonical 表
npm run migrate:altitude-hint
```

### 1. 抓取 POI 数据

```bash
# 使用 npm script（推荐）
npm run fetch:poi:xizang -- --phase1
npm run fetch:poi:xizang -- --region=CN_XZ_LHASA
npm run fetch:poi:xizang -- --all

# 或直接使用 ts-node
ts-node --project tsconfig.backend.json scripts/fetch-osm-poi-xizang.ts --phase1
ts-node --project tsconfig.backend.json scripts/fetch-osm-poi-xizang.ts --region=CN_XZ_LHASA
ts-node --project tsconfig.backend.json scripts/fetch-osm-poi-xizang.ts --all
```

### 2. 导入到数据库

```bash
# 导入原始 OSM 数据
ts-node --project tsconfig.backend.json scripts/import-osm-poi-to-postgis.ts \
  --input data/geographic/poi/osm/xizang/raw/all_regions.json
```

### 3. 规范化处理

```bash
# 规范化 POI（提取 altitude_hint，分类等）
ts-node --project tsconfig.backend.json scripts/normalize-osm-poi.ts
```

## POI 类型

### 保障点 + 补给点
- `HOSPITAL`, `CLINIC`, `PHARMACY` - 医疗
- `SAFETY` (police) - 检查站/派出所
- `FUEL` - 加油站
- `EV_CHARGER` - 充电桩
- `SUPPLY` - 超市/便利店
- `CAR_REPAIR` - 汽车维修
- `TOILETS` - 厕所

### 入口点 + 旅游点
- `PARKING` - 停车点
- `TRAILHEAD` - 徒步入口
- `INFORMATION` - 游客中心
- `CAMPING` - 营地
- `ATTRACTION` - 景点
- `VIEWPOINT` - 观景点
- `ATTRACTION_NATURE` - 自然景观

### 西藏专用
- `OXYGEN_STATION` - 氧气点/供氧站
- `CHECKPOINT` - 检查站/边防
- `MOUNTAIN_PASS` - 山口/垭口

## 数据字段

### poi_canonical 表

- `altitude_hint` (INTEGER) - 海拔提示（米），从 OSM `ele` 字段提取
- `region_key` (VARCHAR) - 区域标识（CN_XZ_*）
- `region_name` (VARCHAR) - 区域名称
- `region_center` (JSONB) - 区域中心点

## Readiness 规则

使用 `xizang-pack.example.ts` 中的规则：

1. **高海拔适应**（must）- 基于 `geo.altitude_m >= 3000`
2. **补给稀疏**（must）- 基于 `geo.fuelDensity < 0.5`
3. **检查站提醒**（should）- 基于 `geo.checkpointCount > 0`
4. **山口风险**（冬季 must）- 基于 `geo.mountainPassCount > 0`

## 注意事项

1. **坐标系统**：OSM 使用 WGS84，如果前端使用 GCJ-02，需要坐标转换
2. **覆盖稀疏**：偏远地区 POI 少是正常的，不要强求
3. **海拔信息**：优先使用 OSM `ele` 字段，后续可用 DEM 补齐
4. **检查站识别**：主要通过名称正则，OSM 标签可能不完整

## 相关文件

- `scripts/fetch-osm-poi-xizang.ts` - 抓取脚本
- `scripts/normalize-osm-poi.ts` - 规范化脚本
- `src/trips/readiness/data/xizang-pack.example.ts` - Readiness Pack
- `docs/XIZANG_POI_INTEGRATION.md` - 完整文档

