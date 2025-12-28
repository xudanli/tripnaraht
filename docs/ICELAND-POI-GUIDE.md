# 冰岛 POI 导入与决策层集成指南

## 概述

本系统为冰岛提供完整的 OSM POI 底座，采用**分区串行抓取**策略，避免连接池问题和超时。系统支持：
- 按区域（region）分区抓取（14 个关键区域）
- 按场景（profile）分类查询（5 个查询 Profile）
- 冰岛特定分类映射（瀑布/温泉/地热/冰川等）
- 性能优化（批量处理、串行执行）
- 决策层（Abu/Dr.Dre/Neptune）集成接口

## 快速开始

### 1. 导入 POI 数据

```bash
# 导入所有 region 和 profile（推荐分阶段执行）
npm run import:iceland-poi -- --phase 1              # Phase 1: MVP 区域（10个）
npm run import:iceland-poi -- --phase 2              # Phase 2: 增强区域（包含 Phase 1）
npm run import:iceland-poi -- --all                  # 全部区域（14个）

# 按 region 导入
npm run import:iceland-poi -- --region IS_REYKJAVIK

# 按 profile 导入
npm run import:iceland-poi -- --profile A            # Transport Nodes

# 组合使用
npm run import:iceland-poi -- --region IS_GOLDEN_CIRCLE --profile C
```

### 2. 在代码中使用决策层接口

```typescript
import { SvalbardPoiFeaturesService } from './places/services/svalbard-poi-features.service';

// 获取冰岛特定区域的 POI Features
const features = await svalbardFeatures.getSvalbardFeatures('IS_REYKJAVIK');

// 使用 features 进行决策
if (features.supply.fuel) {
  // Dr.Dre: 插入加油提醒
}
```

## 系统架构

### 1. 区域划分（Region Seeds）

位置：`data/iceland/region-seeds.json`

**Phase 1（MVP：能跑通环岛与城市出行）**：
- `IS_REYKJAVIK` - 雷克雅未克（住宿、餐饮、医院、港口、信息点）
- `IS_KEFLAVIK_AIRPORT` - 凯夫拉维克机场（KEF：机场+租车+补给）
- `IS_GOLDEN_CIRCLE` - 黄金圈（核心景点+停车+厕所+信息点）
- `IS_SOUTH_COAST` - 南岸（瀑布/黑沙滩/冰川/观景点）
- `IS_VIK` - 维克（补给+救援+观景）
- `IS_HOFN` - 赫本（补给+医疗点+出海入口）
- `IS_EGILSSTADIR` - 埃伊尔斯塔济（东部枢纽）
- `IS_AKUREYRI` - 阿克雷里（北部枢纽）
- `IS_HUSAVIK` - 胡萨维克（观鲸出海强相关）
- `IS_SNAEFELLSNES` - 斯奈山半岛（经典一日/两日线）

**Phase 2（增强：高地与徒步入口闭环）**：
- `IS_LANDMANNALAUGAR` - 兰德曼纳劳卡（高地徒步/温泉）
- `IS_THORSMORK` - 索斯莫克（高地徒步入口）
- `IS_KERLINGARFJOLL` - 高地地热山
- `IS_ASKJA` - 阿斯恰（偏远高地：路况与准备事项更重要）

### 2. Overpass Profiles（查询配置）

位置：`scripts/iceland/overpass-profiles.ts`

定义了 5 个查询 Profile：

- **Profile A: Transport Nodes** - 机场/港口/码头/公交站/停车
- **Profile B: Safety & Supply** - 安全保障点 + 补给
- **Profile C: Attractions & Nature** - 瀑布/温泉/地热/冰川/观景/徒步入口
- **Profile D: Spa & Pools** - 地热池/泳池/SPA（冰岛特色）
- **Profile E: Tourism Services** - 旅行社/旅游办公室/租车/住宿

### 3. Canonical Mapping（类型映射）

位置：`scripts/iceland/canonical-mapping.ts`

将 OSM tags 映射为系统统一的 `PlaceCategory` 和 `canonicalType`：

**冰岛特定分类**：
- `ATTRACTION_NATURE_WATERFALL` - 瀑布
- `ATTRACTION_NATURE_HOT_SPRING` - 温泉
- `ATTRACTION_NATURE_GEYSER` - 地热喷泉
- `ATTRACTION_NATURE_GLACIER` - 冰川
- `ATTRACTION_NATURE_VOLCANO` - 火山
- `ATTRACTION_NATURE_BEACH` - 海滩
- `CAMPING` - 露营地
- `TRAILHEAD` - 徒步入口
- `SPA_POOL` - SPA/泳池
- `TOUR_OPERATOR` - 旅行社
- `CAR_RENTAL` - 租车

### 4. 性能优化策略

#### 串行处理
- **Region 串行**：每个 region 依次处理，避免并发连接池耗尽
- **Profile 串行**：每个 region 内的 profile 依次处理
- **批次延迟**：region-profile 之间延迟 500ms，批次之间延迟 300ms

#### 批量处理
- **检查批次**：1000 条一批检查已存在的 POI
- **插入批次**：200 条一批插入新 POI（减少连接池压力）
- **降级策略**：批量插入失败时自动降级为逐条插入

#### 超时与重试
- **Overpass 超时**：200 秒
- **重试机制**：最多 3 次，递增等待时间（10s, 20s, 30s）
- **数据库事务超时**：30 秒

## 决策层使用场景

### Abu（降级保体验）

```typescript
// 如果高地/徒步入口缺少关键信息 → 降级
const highlandPois = await getPoisByRegion('IS_LANDMANNALAUGAR');
const trailheads = highlandPois.filter(p => p.canonicalType === 'TRAILHEAD');

if (trailheads.length === 0) {
  return {
    confidence: 'low',
    message: '建议提前确认徒步入口和路况',
    requiresManualVerification: true
  };
}
```

### Dr.Dre（带约束排程）

```typescript
// 自驾 + 南岸/东部/高地 → 插入加油提醒
const route = ['IS_REYKJAVIK', 'IS_SOUTH_COAST', 'IS_HOFN'];
const fuelStations = await getPoisByCanonicalType('FUEL_STATION', route);

// 计算最长无加油站路段
const maxGap = calculateMaxFuelGap(route, fuelStations);
if (maxGap > 100) { // 100km
  tasks.push({
    type: 'FUEL_REMINDER',
    message: `下一站之前加满（${maxGap}km 无加油站）`,
    priority: 'HIGH'
  });
}
```

### Neptune（最小改动修复）

```typescript
// 如果某温泉/地热点不可达/关闭 → 替换或调整
function repairThermalFeature(currentPlaceId: number): number | null {
  const alternatives = getPoisByCanonicalType('ATTRACTION_NATURE_HOT_SPRING');
  // 找最近的替代点
  return findNearestAlternative(currentPlaceId, alternatives);
}
```

## Readiness 规则集成

### 1. 高地/徒步入口规则

**触发条件**：`TRAILHEAD` 或 `highland region` 命中

**规则**：
```json
{
  "must": [
    "装备清单",
    "天气/路况确认",
    "备用计划"
  ],
  "should": [
    "离线地图",
    "紧急联系人"
  ]
}
```

### 2. 自驾关键路段规则

**触发条件**：`FUEL_STATION` 稀疏/长距离

**规则**：
```json
{
  "must": [
    "加油提醒（下一站之前加满）",
    "离线地图",
    "备胎/补给检查"
  ],
  "should": [
    "路况查询",
    "天气预警"
  ]
}
```

### 3. 温泉/地热点安全规则

**触发条件**：`hot_spring` / `geyser` / `volcano`

**规则**：
```json
{
  "should": [
    "安全边界提示（热泉烫伤/蒸汽区禁入）",
    "温度警告",
    "防护措施"
  ]
}
```

### 4. 露营/营地规则

**触发条件**：`camp_site`

**规则**：
```json
{
  "should": [
    "营地开放季节",
    "设施说明（厕所/淋浴/支付）",
    "预订要求"
  ]
}
```

## 数据存储

POI 数据存储在 `Place` 表中，`metadata` 字段包含：

```json
{
  "osmId": 123456,
  "osmType": "node",
  "canonicalType": "ATTRACTION_NATURE_WATERFALL",
  "regionKey": "IS_GOLDEN_CIRCLE",
  "source": "OSM",
  "profile": "Attractions & Nature",
  "rawTags": {
    "natural": "waterfall",
    "name": "Gullfoss",
    "name:en": "Golden Falls"
  }
}
```

## 扩展与维护

### 添加新的 Region

在 `data/iceland/region-seeds.json` 中添加：

```json
{
  "region_key": "IS_NEW_REGION",
  "name": "新区域",
  "name_en": "New Region",
  "description": "描述",
  "seed": { "lat": 64.0, "lng": -21.0 },
  "radius_km": 20,
  "scenario": "场景类型",
  "priority": 1
}
```

### 添加新的 Overpass Profile

在 `scripts/iceland/overpass-profiles.ts` 中添加新的 Profile。

### 扩展分类映射

在 `scripts/iceland/canonical-mapping.ts` 的 `mapOsmTagsToCanonical` 函数中添加新的映射逻辑。

## 注意事项

1. **数据量**：冰岛数据量比斯瓦尔巴大很多，建议分阶段导入（Phase 1 → Phase 2）
2. **连接池**：系统已实现串行处理，但仍需注意数据库连接池配置
3. **超时处理**：Overpass API 可能超时，系统已实现重试机制
4. **增量更新**：当前实现会跳过已存在的 POI（通过 OSM ID），支持增量更新
5. **GeoFacts 查询**：同一次规划请求里不要对每个 POI 做多次空间查询，先批量拉出候选再本地计算

## 性能建议

1. **分批执行**：建议先运行 `--phase 1`，验证无误后再运行 `--phase 2`
2. **监控连接**：观察数据库连接池使用情况，必要时调整批次大小
3. **错误恢复**：如果某个 region-profile 失败，可以单独重新运行该任务
4. **数据验证**：导入后建议验证关键区域的 POI 数量和质量

## 相关文档

- [斯瓦尔巴 POI 导入指南](./SVALBARD-POI-GUIDE.md) - 参考实现
- [尼泊尔 POI 导入指南](./NEPAL-POI-IMPORT-GUIDE.md) - 分区策略参考
- [决策层文档](../src/trips/decision/README.md) - Abu/Dr.Dre/Neptune 策略说明
- [API 接口文档](./API-接口文档-前端使用指南.md) - 前端集成指南

