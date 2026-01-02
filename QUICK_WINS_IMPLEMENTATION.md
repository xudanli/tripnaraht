# 三个快招实现说明

## 概述

本文档说明三个"快招"的实现情况，这些改进旨在快速提升 POI 数据的质量和可用性。

---

## 快招1：补齐 openingHours + business_status（让 Abu 立刻变强）

### 实现状态
✅ **接口已扩展**

### 变更内容

1. **PlaceMetadata 接口扩展**（`src/places/interfaces/place-metadata.interface.ts`）

```typescript
// ⏰ 营业时间（已扩展）
openingHours?: {
  // ... 现有字段 ...
  // 新增：OSM opening_hours 格式（原始字符串）
  osmFormat?: string;
};

// 🟢 新增：营业状态（用于前端显示红黄绿）
business_status?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY' | 'UNKNOWN';
```

### 使用说明

- `business_status` 字段用于前端显示营业状态（红/黄/绿）
  - `OPERATIONAL`: 正常营业（绿色）
  - `CLOSED_TEMPORARILY`: 临时关闭（黄色）
  - `CLOSED_PERMANENTLY`: 永久关闭（红色）
  - `UNKNOWN`: 未知（灰色）

- `openingHours.osmFormat` 存储 OSM 格式的原始字符串（如 `"Mo-Fr 09:00-18:00"`），用于兼容 OSM 数据源

### 待实现功能

- [ ] OSM opening_hours 解析器（将 OSM 格式转换为结构化 openingHours）
- [ ] Google Places API business_status 映射
- [ ] 列表视图的营业状态显示（红黄绿指示器）

---

## 快招2：estimated_duration_min 数据源优先

### 实现状态
✅ **核心逻辑已实现**

### 变更内容

1. **PlaceMetadata 接口扩展**

```typescript
// ⏱️ 游玩时长数据源（快招2：数据源优先）
/** 官方建议停留时长（分钟）- 最高优先级 */
officialDurationMin?: number;
/** Google Popular Times 推断的典型停留时长（分钟） */
googlePopularTimesDurationMin?: number;
/** 同类 POI 统计中位数（分钟）- 按 category + subCategory + country 计算 */
medianDurationBySimilarPoi?: number;
```

2. **PhysicalMetadataGenerator 逻辑更新**（`src/places/utils/physical-metadata-generator.util.ts`）

添加了 `getDurationFromDataSources` 方法，按以下优先级获取时长：

```
优先级从高到低：
1. officialDurationMin（官方建议停留时长）
2. googlePopularTimesDurationMin（Google Popular Times 推断）
3. medianDurationBySimilarPoi（同类 POI 统计中位数）
4. visitDuration（原有逻辑，字符串解析）
5. typicalStay（原有逻辑）
```

### 使用示例

```typescript
// metadata 示例
const metadata = {
  officialDurationMin: 120,  // 官方建议 2 小时（最高优先级）
  googlePopularTimesDurationMin: 90,  // Google 推断 1.5 小时（会被 officialDurationMin 覆盖）
  medianDurationBySimilarPoi: 75,  // 同类 POI 中位数 1.25 小时（最低优先级）
};

// 生成的 physicalMetadata 将使用 officialDurationMin (120 分钟)
const physicalMetadata = PhysicalMetadataGenerator.generateByCategory(
  PlaceCategory.ATTRACTION,
  metadata
);
// physicalMetadata.estimated_duration_min = 120
```

### 待实现功能

- [ ] 垂直平台/官方 API 数据抓取（填充 `officialDurationMin`）
- [ ] Google Popular Times API 集成（填充 `googlePopularTimesDurationMin`）
- [ ] 同类 POI 统计计算脚本（填充 `medianDurationBySimilarPoi`）
  - 按 `category + subCategory + countryCode` 分组
  - 计算中位数并批量更新

---

## 快招3：trailDifficulty 接到 Trail 表（强绑定）

### 实现状态
✅ **服务已创建，接口已扩展**

### 变更内容

1. **PlaceMetadata 接口扩展**

```typescript
// 🥾 徒步路线关联（快招3：强绑定 Trail 数据）
/** 关联的 Trail ID（用于徒步类 POI） */
trailId?: number;
/** 关联的路由 ID（外部系统，如 AllTrails/Komoot） */
routeId?: string;
/** 路由数据源（alltrails, komoot, internal） */
routeSource?: 'alltrails' | 'komoot' | 'internal';
```

2. **PlaceTrailEnrichmentService 服务**（`src/places/services/place-trail-enrichment.service.ts`）

新增服务类，用于：
- 通过 `trailId` 从 Trail 表获取数据
- 通过 `routeId`（仅 internal 源）从 Trail 表获取数据
- 从 Trail 记录构建 physicalMetadata 补丁

### 使用示例

```typescript
// 1. 在 Place metadata 中设置 trailId
const place = await prisma.place.create({
  data: {
    metadata: {
      trailId: 123,  // 关联 Trail ID
      // 或者
      routeId: 'trail-uuid-here',
      routeSource: 'internal',
    },
  },
});

// 2. 使用服务获取 Trail 数据并增强 physicalMetadata
const enrichmentService = new PlaceTrailEnrichmentService(prismaService);
const trailPatch = await enrichmentService.enrichFromTrail(place.metadata);

if (trailPatch) {
  // 合并到 physicalMetadata
  const enhanced = {
    ...basePhysicalMetadata,
    ...trailPatch,  // 包含 estimated_duration_min（从 Trail.estimatedDurationHours 转换）
  };
}
```

### Trail 表字段映射

从 Trail 表获取的字段：
- `estimatedDurationHours` → `estimated_duration_min`（小时转分钟）
- `difficultyLevel` → 在 `PhysicalMetadataGenerator.applyDifficultyModifier` 中处理（弱耦合调制器）
- `elevationGainM`、`distanceKm` → 已体现在 `Trail.fatigueScore` 中，不需要重复计算

### 待实现功能

- [ ] 在 PlacesService 或 PlacesController 中集成 PlaceTrailEnrichmentService
- [ ] AllTrails/Komoot 外部 API 集成（填充 `routeId` 和 `routeSource`）
- [ ] 批量 Trail 数据同步脚本
- [ ] 前端 Dr.Dre 视图显示 Trail 数据（distance, elevation gain, duration, difficulty）

---

## 集成建议

### 1. 在 PlacesService 中集成

```typescript
// src/places/places.service.ts

import { PlaceTrailEnrichmentService } from './services/place-trail-enrichment.service';

@Injectable()
export class PlacesService {
  constructor(
    private prisma: PrismaService,
    private trailEnrichment: PlaceTrailEnrichmentService,  // 注入服务
  ) {}

  async getPlaceWithEnhancedMetadata(placeId: number) {
    const place = await this.prisma.place.findUnique({ where: { id: placeId } });
    
    // 如果有 trailId 或 routeId，从 Trail 表获取数据
    const metadata = place.metadata as PlaceMetadata;
    const trailPatch = await this.trailEnrichment.enrichFromTrail(metadata);
    
    // 合并 physicalMetadata
    if (trailPatch) {
      place.physicalMetadata = {
        ...(place.physicalMetadata || {}),
        ...trailPatch,
      };
    }
    
    return place;
  }
}
```

### 2. 在 PlacesModule 中注册服务

```typescript
// src/places/places.module.ts

import { PlaceTrailEnrichmentService } from './services/place-trail-enrichment.service';

@Module({
  providers: [
    PlacesService,
    PlaceTrailEnrichmentService,  // 注册服务
  ],
  // ...
})
export class PlacesModule {}
```

### 3. 数据导入脚本示例

```typescript
// scripts/enrich-poi-with-trail-data.ts

// 为徒步类 POI 关联 Trail 数据
const hikingPois = await prisma.place.findMany({
  where: {
    category: 'ATTRACTION',
    metadata: {
      path: ['accessType'],
      string_contains: 'HIKING',
    },
  },
});

for (const poi of hikingPois) {
  // 查找关联的 Trail（通过名称匹配或坐标匹配）
  const trail = await findRelatedTrail(poi);
  
  if (trail) {
    await prisma.place.update({
      where: { id: poi.id },
      data: {
        metadata: {
          ...poi.metadata,
          trailId: trail.id,
        },
      },
    });
  }
}
```

---

## 总结

三个快招的核心接口和逻辑已经实现：

1. ✅ **快招1**：接口已扩展，待实现数据抓取和解析逻辑
2. ✅ **快招2**：核心优先级逻辑已实现，待实现数据源填充
3. ✅ **快招3**：服务已创建，待集成到现有流程

下一步工作：
- 实现数据抓取脚本（OSM、Google Places API）
- 实现统计计算脚本（medianDurationBySimilarPoi）
- 集成 PlaceTrailEnrichmentService 到现有服务
- 前端视图更新（显示 business_status、Trail 数据）

