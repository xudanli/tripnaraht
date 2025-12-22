# 西藏 POI 集成方案

## 概述

本文档说明西藏（Xizang/Tibet）POI 数据的抓取、导入和 Readiness 规则集成方案。

## 核心差异

### 与欧洲目的地的差异

1. **OSM 覆盖不均**
   - 城市还行（拉萨、日喀则等）
   - 偏远地区稀疏（阿里、珠峰大本营等）

2. **关键关注点不同**
   - 欧洲：景点数量、开放时间、预订
   - 西藏：**高海拔安全 + 补给点 + 检查站/边防限制 + 路况封闭**

## 分区抓取策略

### Phase 1: MVP（8 个区域）

覆盖真实旅行最常用的路线闭环（G318/拉林线/日喀则线/阿里线）：

1. **CN_XZ_LHASA** - 拉萨：医院/药店/补给/信息点/景点
2. **CN_XZ_NYINGCHI** - 林芝：低海拔适应、森林峡谷玩法
3. **CN_XZ_SHIGATSE** - 日喀则：后藏枢纽
4. **CN_XZ_GYANTSE** - 江孜：景点+补给
5. **CN_XZ_TINGRI_EBC** - 定日/珠峰大本营入口：补给+边检/限制提示
6. **CN_XZ_NAGQU** - 那曲：高海拔过渡
7. **CN_XZ_ALI_SHIQUANHE** - 狮泉河：阿里枢纽
8. **CN_XZ_CHAMDO** - 昌都：川藏线关键段

### 查询半径

- 城市/县城：**50km**（R=50000）
- 珠峰/阿里等稀疏区：**120-200km**（R=120000~200000）

## POI 类型优先级

### A. 高海拔生存与保障（必须）

- `amenity=hospital|clinic|pharmacy` - 医疗
- `amenity=police` - 检查站/派出所
- `amenity=toilets` - 厕所
- **氧气点**：名称正则 `name~"(氧气|供氧|oxygen|O2)"`

### B. 自驾补给（必须）

- `amenity=fuel` - 加油站
- `amenity=charging_station` - 充电桩（电车自驾关键）
- `shop=supermarket|convenience` - 超市/便利店
- `amenity=car_repair` - 汽车维修（偏远地区救命）

### C. 入口点（让行程"落地"）

- `amenity=parking` - 停车点（很多景区/徒步入口）
- `highway=trailhead` - 徒步入口
- `tourism=information` - 游客中心/信息点
- `tourism=camp_site` - 营地

### D. 旅游点（景点/宗教/自然）

- `tourism=attraction|viewpoint` - 景点/观景点
- `amenity=place_of_worship` - 寺庙/宗教点
- `natural=peak|glacier|waterfall|hot_spring` - 自然景观
- `mountain_pass=yes` - 山口/垭口（常带 `ele=*`）

## Overpass 查询模板

### 1. 保障点 + 补给点（必跑）

```overpass
[out:json][timeout:180];
(
  nwr["amenity"="hospital"](around:{R}, {LAT}, {LNG});
  nwr["amenity"="clinic"](around:{R}, {LAT}, {LNG});
  nwr["amenity"="pharmacy"](around:{R}, {LAT}, {LNG});
  nwr["amenity"="police"](around:{R}, {LAT}, {LNG});
  nwr["amenity"="fuel"](around:{R}, {LAT}, {LNG});
  nwr["amenity"="charging_station"](around:{R}, {LAT}, {LNG});
  nwr["shop"="supermarket"](around:{R}, {LAT}, {LNG});
  nwr["shop"="convenience"](around:{R}, {LAT}, {LNG});
  nwr["amenity"="car_repair"](around:{R}, {LAT}, {LNG});
  nwr["amenity"="toilets"](around:{R}, {LAT}, {LNG});
  nwr["amenity"="shelter"](around:{R}, {LAT}, {LNG});
);
out center tags;
```

### 2. 入口点 + 旅游点（建议跑）

```overpass
[out:json][timeout:180];
(
  nwr["amenity"="parking"](around:{R}, {LAT}, {LNG});
  nwr["highway"="trailhead"](around:{R}, {LAT}, {LNG});
  nwr["tourism"="information"](around:{R}, {LAT}, {LNG});
  nwr["tourism"="camp_site"](around:{R}, {LAT}, {LNG});
  nwr["tourism"="attraction"](around:{R}, {LAT}, {LNG});
  nwr["tourism"="viewpoint"](around:{R}, {LAT}, {LNG});
  nwr["amenity"="place_of_worship"](around:{R}, {LAT}, {LNG});
  nwr["natural"="peak"](around:{R}, {LAT}, {LNG});
  nwr["natural"="glacier"](around:{R}, {LAT}, {LNG});
  nwr["natural"="waterfall"](around:{R}, {LAT}, {LNG});
  nwr["natural"="hot_spring"](around:{R}, {LAT}, {LNG});
  nwr["mountain_pass"](around:{R}, {LAT}, {LNG});
);
out center tags;
```

### 3. 氧气点/供氧站（名称正则召回）

```overpass
[out:json][timeout:180];
(
  nwr["name"~"(氧气|供氧|oxygen|O2)",i](around:{R}, {LAT}, {LNG});
  nwr["brand"~"(氧气|oxygen|O2)",i](around:{R}, {LAT}, {LNG});
);
out center tags;
```

## 数据库字段

### poi_canonical 表新增字段

- **`altitude_hint`** (INTEGER) - 海拔提示（米）
  - 优先从 OSM `ele` 字段提取
  - 如果 OSM 数据中没有，系统会自动从 DEM 数据查询并补齐
  - 使用 `npm run update:poi:altitude:dem` 批量更新

- **`region_key`** (VARCHAR) - 区域标识（已有）
  - 每条 canonical 记录打上 `CN_XZ_*`
  - 方便按 region 重跑/回滚
  - 方便按 region 做可解释统计

## Readiness 规则

### 1. 高海拔适应（必须）

**触发**：region 是西藏 or `altitude_m >= 3000`

**动作**：
- D1 轻量活动、补水、避免酒精、睡眠建议
- D2 才上强度活动
- 必备物品：氧气/药品/保暖分层

### 2. 长距离补给稀疏（must）

**触发**：两段路程距离长 + 沿途 FUEL 密度低

**动作**：
- 自动插入"补给点停靠"或调整行程节奏
- 提示在主要城市储备物资

### 3. 检查站/边境敏感区域提醒（should/must）

**触发**：命中 police/名称含"检查站/边防"

**动作**：
- 提示证件、边防证、拍照限制
- 行程缓冲时间

### 4. 山口/垭口跨越风险（冬季/夜间 must）

**触发**：路线命中 `mountain_pass` 或山地覆盖高 + 夜间长转场

**动作**：
- 加 buffer
- 避免夜行
- 提示查路况/封路

## 坐标系统

### 重要提醒

- **OSM 数据**：WGS84
- **国内常见底图**：可能是 GCJ-02
- **影响**：POI 会有偏移（对"停车点/入口点"尤其致命）

### 解决方案

1. **短期**：OSM 当"底座 + 稀疏可解释点"
2. **长期**：接入后续渠道/文旅开放数据补齐"门票/开放时间/电话"等动态字段
3. **坐标转换**：如果需要在前端显示，需要 WGS84 → GCJ-02 转换

## 使用流程

### 1. 抓取 POI 数据

```bash
# Phase 1（8 个区域）
ts-node scripts/fetch-osm-poi-xizang.ts --phase1

# 单个区域
ts-node scripts/fetch-osm-poi-xizang.ts --region=CN_XZ_LHASA

# 所有区域
ts-node scripts/fetch-osm-poi-xizang.ts --all
```

### 2. 导入到数据库

```bash
# 导入原始 OSM 数据
ts-node scripts/import-osm-poi-to-postgis.ts \
  --input data/geographic/poi/osm/xizang/raw/all_regions.json
```

### 3. 规范化处理

```bash
# 规范化 POI（提取 altitude_hint，分类等）
ts-node scripts/normalize-osm-poi.ts
```

### 4. 使用 Readiness Pack

```typescript
import { xizangPack } from './readiness/data/xizang-pack.example';

const result = await readinessService.checkFromPacks(
  [xizangPack],
  context
);
```

## 注意事项

1. **串行抓取**：避免 Overpass 限流，区域之间等待 10 秒
2. **覆盖稀疏**：偏远地区 POI 少是正常的，不要强求
3. **海拔信息**：优先使用 OSM `ele` 字段，缺失时自动从 DEM 数据查询补齐
4. **检查站识别**：主要通过名称正则，OSM 标签可能不完整
5. **坐标转换**：如果前端使用 GCJ-02，需要转换

## 相关文件

- `scripts/fetch-osm-poi-xizang.ts` - 西藏 POI 抓取脚本
- `scripts/normalize-osm-poi.ts` - POI 规范化脚本（已更新支持 altitude_hint）
- `src/trips/readiness/data/xizang-pack.example.ts` - 西藏 Readiness Pack
- `data/geographic/poi/osm/xizang/raw/` - 原始数据目录

