# 冰岛核心景点和路线架构

本文档描述了冰岛核心景点清单（POI List）和路线架构（Route Schema）的设置。

## 概述

本目录包含：
- `core-pois.json`: 核心景点清单（Tier 1 和 Tier 2）
- `routes.json`: 路线架构定义
- `region-seeds.json`: 区域种子数据（已存在）

## 核心景点清单

### Tier 1: 绝对经典（The "Big Five" of Iceland）

这些是流量最大、第一次去冰岛的用户最关心的景点：

1. **蓝湖 (Blue Lagoon)**
   - 地热温泉，世界级地标
   - 坐标: 63.8804, -22.4494

2. **黄金瀑布 (Gullfoss)**
   - 黄金圈核心，气势磅礴
   - 坐标: 64.3261, -20.1200

3. **杰古沙龙冰河湖 (Jökulsárlón)**
   - 巨大的漂浮冰山，电影取景地
   - 坐标: 64.0485, -16.1794

4. **黑沙滩 (Reynisfjara)**
   - 玄武岩柱和海浪
   - ⚠️ **安全警告: high** - 需标记 safety_warning: high
   - 坐标: 63.4048, -19.0453

5. **辛格维利尔国家公园 (Þingvellir National Park)**
   - 欧美板块裂缝，世界遗产
   - 坐标: 64.2556, -21.1297

### Tier 2: 摄影师/高阶用户最爱

TripNARA 的差异化可以通过推荐这些景点体现：

1. **钻石沙滩 (Diamond Beach)**
   - 就在冰河湖对面，黑沙上的碎冰
   - 坐标: 64.0485, -16.1794

2. **斯科加瀑布 (Skógafoss)**
   - 南岸两大瀑布之一
   - 坐标: 63.5314, -19.5114

3. **塞里雅兰瀑布 (Seljalandsfoss)**
   - 南岸两大瀑布之一，可以走到水帘后面
   - 坐标: 63.6156, -19.9897

4. **教会山 (Kirkjufell)**
   - 《权力的游戏》取景地，斯奈山半岛标志
   - 坐标: 64.9417, -23.3069

5. **斯蒂德吉尔峡谷 (Stuðlagil Canyon)**
   - 网红玄武岩峡谷，近几年非常火
   - 适合增加到"小众/深度"推荐中
   - 坐标: 65.1644, -15.3011

## 路线架构

### 基础路线

#### 1. 黄金圈 (Golden Circle)
- **Route ID**: `golden_circle`
- **描述**: 300公里闭环，当天往返雷克雅未克
- **包含**: Þingvellir, Geysir, Gullfoss
- **属性**: 
  - difficulty: easy
  - season: all_year
  - duration: 1_day

#### 2. 1号公路环岛 (Ring Road)
- **Route ID**: `ring_road`
- **描述**: 环绕冰岛一周的主干道，约 1332 公里
- **包含**: 南岸瀑布、冰河湖、米湖、阿克雷里等
- **属性**: 
  - difficulty: medium
  - season: all_year (冬季需谨慎)
  - duration: 7_to_10_days

### 进阶/官方新兴路线

#### 3. 钻石圈 (Diamond Circle)
- **Route ID**: `diamond_circle`
- **定位**: 北部的"黄金圈"，针对去北部深度游的用户
- **核心节点**:
  - Goðafoss (众神瀑布)
  - Lake Mývatn (米湖): 地热、火山地貌
  - Dettifoss (黛提瀑布): 欧洲水量最大的瀑布，普罗米修斯取景地
  - Ásbyrgi (马蹄形峡谷)
  - Húsavík (胡萨维克): 观鲸之都
- **建议**: 这是夏季自驾的极佳补充路线

#### 4. 北极海岸之路 (Arctic Coast Way)
- **Route ID**: `arctic_coast_way`
- **定位**: 2019年新开通的官方路线，主打"远离人群"和"北极圈"
- **描述**: 沿着北部海岸线行驶，而不是走内陆的1号公路。全长 900 公里，经过 21 个渔村
- **核心体验**: 孤独感、午夜阳光、极度小众
- **属性**: 
  - tag: off_the_beaten_path
  - vehicle: 4x4_recommended (部分路段非铺装)

#### 5. 西峡湾之路 (Westfjords Way)
- **Route ID**: `westfjords_way`
- **定位**: 终极探险
- **核心节点**: 
  - Dynjandi (丁扬迪瀑布)
  - Rauðasandur (红沙滩)
  - Látrabjarg (海鹦悬崖)
- **属性**: 
  - season: summer_only (冬季几乎完全封闭)
  - scenic_level: max

## 数据结构

### POI 元数据字段

在 `Place` 表的 `metadata` 字段中存储：

```json
{
  "tier": "Tier 1 (Classic)" | "Tier 2 (Photographer/Advanced)",
  "is_landmark": true | false,
  "safety_warning": "high" | "medium" | "low" (可选),
  "tags": ["geothermal", "spa", "landmark", ...]
}
```

### RouteDirection 字段

路线通过 `RouteDirection` 表存储，关键字段：

- `signaturePois`: 关联的 POI 列表
- `regions`: 区域列表（如 `IS_GOLDEN_CIRCLE`）
- `entryHubs`: 入口枢纽（如 `IS_REYKJAVIK`）
- `seasonality`: 季节性信息
- `constraints`: 约束条件（难度、季节、时长、车辆要求等）
- `riskProfile`: 风险画像

## 使用方法

### 运行设置脚本

```bash
# 预览模式（不会实际修改数据库）
tsx scripts/setup-iceland-core-pois-and-routes.ts --dry-run

# 执行模式（实际修改数据库）
tsx scripts/setup-iceland-core-pois-and-routes.ts
```

### 脚本功能

1. **标记核心 POI**
   - 查找数据库中已存在的 POI（通过名称或坐标）
   - 更新 `metadata` 字段，添加 `tier`、`is_landmark`、`safety_warning` 等属性
   - 如果 POI 不存在，则创建新记录

2. **创建或更新路线**
   - 检查 `RouteDirection` 表中是否已存在同名路线
   - 如果存在则更新，不存在则创建
   - 自动关联 `signaturePois` 字段中的 POI

3. **关联 POI 到路线**
   - 通过 POI 名称匹配，找到对应的 Place ID
   - 将 Place ID 添加到路线的 `signaturePois.examples` 字段

## 查询示例

### 查询 Tier 1 景点

```sql
SELECT id, name_cn, name_e_n, metadata
FROM "Place"
WHERE category = 'ATTRACTION'
  AND metadata->>'tier' = 'Tier 1 (Classic)'
  AND metadata->>'is_landmark' = 'true';
```

### 查询包含特定 POI 的路线

```sql
SELECT id, name_cn, signature_pois
FROM "RouteDirection"
WHERE country_code = 'IS'
  AND signature_pois->'examples' @> '[{"placeId": 123}]'::jsonb;
```

### 查询特定路线的所有 POI

```sql
SELECT p.id, p.name_cn, p.name_e_n
FROM "Place" p
JOIN "RouteDirection" rd ON (
  rd.signature_pois->'examples' @> jsonb_build_array(jsonb_build_object('placeId', p.id))
)
WHERE rd.name = 'golden_circle';
```

## 维护

### 添加新 POI

1. 在 `core-pois.json` 中添加新 POI 定义
2. 运行设置脚本更新数据库

### 修改路线

1. 在 `routes.json` 中修改路线定义
2. 运行设置脚本更新数据库

### 关联 POI 到路线

在 `routes.json` 的 `signaturePoiNames` 字段中添加 POI 名称（英文或中文），脚本会自动匹配并关联。

## 注意事项

1. **坐标精度**: POI 坐标使用 WGS84 (EPSG:4326) 格式
2. **名称匹配**: 脚本会尝试通过中英文名称和坐标（500米范围内）匹配现有 POI
3. **安全警告**: 黑沙滩 (Reynisfjara) 必须标记 `safety_warning: high`
4. **路线关联**: 如果 POI 名称在数据库中找不到，路线仍会创建，但 `signaturePois` 中不会包含该 POI
