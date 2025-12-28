# 斯瓦尔巴 POI 导入与决策层集成指南

## 概述

本系统为斯瓦尔巴（以 Longyearbyen 为核心）提供完整的 OSM POI 底座，包括：
- 码头/出海集合点识别与评分
- 徒步入口识别与停车点关联
- 安全保障点与补给点覆盖
- 决策层（Abu/Dr.Dre/Neptune）集成接口

## 快速开始

### 1. 导入 POI 数据

```bash
# 导入所有 profile
npm run import:svalbard-poi -- --all

# 只导入特定 profile（A: 码头, B: 徒步入口, C: 安全保障, D: 交通, E: 户外服务）
npm run import:svalbard-poi -- --profile A

# 导入并计算码头评分
npm run import:svalbard-poi -- --all --score-pickup

# 导入并识别徒步入口
npm run import:svalbard-poi -- --all --identify-trailheads

# 完整导入（包含评分和识别）
npm run import:svalbard-poi -- --all --score-pickup --identify-trailheads
```

### 2. 在代码中使用决策层接口

```typescript
import { SvalbardPoiFeaturesService } from './places/services/svalbard-poi-features.service';

// 在决策层服务中注入
constructor(
  private readonly svalbardFeatures: SvalbardPoiFeaturesService
) {}

// 获取 POI Features
const features = await this.svalbardFeatures.getSvalbardFeatures('SVALBARD_LONGYEARBYEN');

// 使用 features 进行决策
if (features.ports.topPickupPoints.length > 0) {
  // Abu: 如果找不到高置信集合点 → 降级
  const topPickup = features.ports.topPickupPoints[0];
  if (topPickup.pickupScore < 50) {
    // 降级处理
  }
}

// Dr.Dre: 排程时使用
if (features.safety.pharmacy) {
  // 插入药房补给任务
}

// Neptune: 修复时使用
if (!features.ports.hasHarbour) {
  // 替换集合点或调整活动
}
```

## 系统架构

### 1. Overpass Profiles（查询配置）

位置：`scripts/svalbard/overpass-profiles.ts`

定义了 5 个查询 Profile：

- **Profile A: Ports & Marine Access** - 码头/渡轮/栈桥/港区
- **Profile B: Trailheads & Information** - 徒步入口/信息点/观景点
- **Profile C: Safety & Supply** - 安全保障点 + 补给
- **Profile D: Transport Nodes** - 机场/交通枢纽
- **Profile E: Outdoor Equipment & Services** - 户外装备/租赁/旅行社

### 2. Canonical Mapping（类型映射）

位置：`scripts/svalbard/canonical-mapping.ts`

将 OSM tags 映射为系统统一的 `PlaceCategory` 和 `canonicalType`：

```typescript
// 示例映射
amenity=ferry_terminal → TRANSIT_HUB / PORT_FERRY_TERMINAL
highway=trailhead → ATTRACTION / TRAILHEAD
amenity=hospital → ATTRACTION / HOSPITAL
```

### 3. 码头/出海集合点评分器

位置：`scripts/svalbard/pickup-point-scorer.ts`

评分规则：
- **+100**: `amenity=ferry_terminal`（强信号）
- **+60**: `man_made=pier`（中强信号）
- **+40**: `leisure=marina` / `landuse=harbour`（港区语义）
- **+30**: 带 `tourism=information`（游客中心）
- **+20**: 有 `website/phone/opening_hours`（可联系/可核验）
- **+10**: 离城镇中心近 / 距离海岸线 < 300m
- **-30**: 明显是 `cargo/industrial`（货运港区）

输出：Top 1~3 个"最可能集合点"，每个点带解释。

### 4. 徒步入口识别器

位置：`scripts/svalbard/trailhead-identifier.ts`

识别策略：
1. 优先识别 `highway=trailhead`（强信号）
2. 如果不足：找 `tourism=information` 且附近 50m 有 `highway=path/footway`
3. 关联最近的停车点（`amenity=parking`，500m 内）

输出：`TrailAccessPoint`，包含：
- 徒步入口点
- 关联的停车点（如果有）
- 置信度（high/medium/low）
- 原因说明

### 5. 决策层集成服务

位置：`src/places/services/svalbard-poi-features.service.ts`

提供结构化的 `SvalbardGeoFeatures` 接口：

```typescript
{
  ports: {
    topPickupPoints: PickupPoint[];  // Top 3 集合点
    hasHarbour: boolean;
    totalPorts: number;
  };
  trail: {
    trailheads: TrailAccessPoint[];
    trailAccessPoints: TrailAccessPoint[];
    totalTrailheads: number;
  };
  safety: {
    hospital: boolean;
    clinic: boolean;
    pharmacy: boolean;
    police: boolean;
    fireStation: boolean;
    totalSafetyPoints: number;
  };
  supply: {
    fuel: boolean;
    supermarket: boolean;
    convenience: boolean;
    totalSupplyPoints: number;
  };
  transport: {
    airport: boolean;
    parking: boolean;
    totalTransportPoints: number;
  };
}
```

## 决策层使用场景

### Abu（降级保体验）

```typescript
const features = await svalbardFeatures.getSvalbardFeatures();

// 如果找不到高置信"集合点/入口点" → 降级
if (features.ports.topPickupPoints.length === 0 || 
    features.ports.topPickupPoints[0].pickupScore < 50) {
  // 让行程降级成"推荐 + 需要确认"，避免幻觉式确定答案
  return {
    confidence: 'low',
    message: '建议提前确认出海集合点',
    alternatives: features.ports.topPickupPoints
  };
}
```

### Dr.Dre（带约束排程）

```typescript
const features = await svalbardFeatures.getSvalbardFeatures();

// 把"到达后先去游客中心/集合点踩点、确认出海集合时间、补给/药房"排成 T-1 / 当天早晨任务
const tasks = [];

if (features.ports.topPickupPoints.length > 0) {
  tasks.push({
    type: 'VERIFY_PICKUP',
    placeId: features.ports.topPickupPoints[0].placeId,
    priority: 'HIGH',
    timeWindow: 'T-1_OR_MORNING'
  });
}

if (features.safety.pharmacy) {
  tasks.push({
    type: 'SUPPLY_STOP',
    category: 'PHARMACY',
    priority: 'MEDIUM',
    timeWindow: 'BEFORE_REMOTE_SECTION'
  });
}
```

### Neptune（最小改动修复）

```typescript
const features = await svalbardFeatures.getSvalbardFeatures();

// 如果某出海活动集合点不可达/太远 → 换下一个高分集合点
function repairPickupPoint(currentPlaceId: number): number | null {
  const currentIndex = features.ports.topPickupPoints.findIndex(
    p => p.placeId === currentPlaceId
  );
  
  if (currentIndex === -1 || currentIndex >= features.ports.topPickupPoints.length - 1) {
    return null; // 没有替代方案
  }
  
  // 返回下一个高分集合点
  return features.ports.topPickupPoints[currentIndex + 1].placeId;
}
```

## 数据存储

POI 数据存储在 `Place` 表中，`metadata` 字段包含：

```json
{
  "osmId": 123456,
  "osmType": "node",
  "canonicalType": "PORT_FERRY_TERMINAL",
  "region": "SVALBARD_LONGYEARBYEN",
  "source": "OSM",
  "profile": "Ports & Marine Access",
  "pickupScore": 100,
  "pickupReasons": "强信号：ferry_terminal（渡轮 terminal）; 加分：有网站（可核验）",
  "trailheadConfidence": "high",
  "trailheadReasons": "强信号：highway=trailhead（OSM 专门标识的步道入口）",
  "associatedParking": 789012,
  "distanceToParking": 150,
  "rawTags": {
    "amenity": "ferry_terminal",
    "name": "Longyearbyen Ferry Terminal",
    "website": "https://example.com"
  }
}
```

## 扩展与维护

### 添加新的 Overpass Profile

在 `scripts/svalbard/overpass-profiles.ts` 中添加新的 Profile：

```typescript
export const PROFILE_F_NEW_CATEGORY: OverpassProfile = {
  name: 'New Category',
  description: '描述',
  query: `[out:json][timeout:60];
(
  nwr["tag"="value"](around:{R},{LAT},{LNG});
);
out center tags;`
};
```

### 扩展评分规则

在 `scripts/svalbard/pickup-point-scorer.ts` 的 `scorePickupPoint` 函数中添加新的评分逻辑。

### 扩展决策层接口

在 `src/places/services/svalbard-poi-features.service.ts` 中添加新的查询方法。

## 注意事项

1. **Overpass API 限流**：系统已实现重试机制，但建议分批导入避免超时
2. **海岸线数据**：如需精确计算距离海岸线，需要先导入海岸线数据到 PostGIS
3. **增量更新**：当前实现会跳过已存在的 POI（通过 OSM ID），支持增量更新
4. **数据质量**：OSM 数据可能不完整，建议结合其他数据源验证

## 相关文档

- [尼泊尔 POI 导入指南](./NEPAL-POI-IMPORT-GUIDE.md) - 参考实现
- [决策层文档](../src/trips/decision/README.md) - Abu/Dr.Dre/Neptune 策略说明
- [API 接口文档](./API-接口文档-前端使用指南.md) - 前端集成指南

