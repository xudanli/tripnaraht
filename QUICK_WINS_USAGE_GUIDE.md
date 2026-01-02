# 三个快招使用指南

## 快速开始

### 1. 运行统计计算脚本（快招2）

计算同类 POI 的游玩时长中位数：

```bash
npx ts-node --project tsconfig.backend.json scripts/calculate-median-duration-by-similar-poi.ts
```

**输出示例：**
```
📊 开始计算同类 POI 的统计中位数...

找到 28570 个有 estimated_duration_min 的 POI

分成 234 个组

  ATTRACTION/museum/CN: 中位数 90 分钟 (156 个 POI)
  ATTRACTION/park/CN: 中位数 120 分钟 (234 个 POI)
  ATTRACTION/viewpoint/NP: 中位数 30 分钟 (89 个 POI)
  ...

============================================================
✅ 处理完成！

📊 统计结果:
  总 POI 数: 28570
  已更新: 18234
  跳过（无需更新或样本不足）: 10336
  有效分组数: 234
============================================================
```

### 2. 运行 OSM opening_hours 解析脚本（快招1）

解析并更新 OSM 格式的营业时间：

```bash
npx ts-node --project tsconfig.backend.json scripts/enrich-poi-with-osm-opening-hours.ts
```

**输出示例：**
```
📊 开始为 POI 添加 OSM opening_hours...

找到 1234 个可能有 opening_hours 的 POI

处理批次 1/13 (100 个 POI)...
  进度: 500/1234
  已更新: 456, 跳过: 44, 错误: 0

...

============================================================
✅ 处理完成！

📊 统计结果:
  总 POI 数: 1234
  已更新: 1102
  跳过（无需更新或无法解析）: 132
  错误: 0
============================================================
```

### 3. 在代码中使用 Trail enrichment（快招3）

当 POI 的 metadata 中包含 `trailId` 时，系统会自动从 Trail 表获取数据：

```typescript
// 1. 设置 trailId
await prisma.place.update({
  where: { id: poiId },
  data: {
    metadata: {
      ...existingMetadata,
      trailId: 123,  // Trail ID
    },
  },
});

// 2. 查询时会自动增强
const placeDetail = await placesService.findOne(poiId);
// placeDetail.physicalMetadata 会包含从 Trail 表获取的数据
// 例如：estimated_duration_min 来自 Trail.estimatedDurationHours
```

---

## API 使用示例

### 获取地点详情（自动应用 Trail enrichment）

```bash
GET /api/places/123
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "id": 123,
    "nameCN": "珠穆朗玛峰大本营",
    "category": "ATTRACTION",
    "metadata": {
      "countryCode": "NP",
      "trailId": 456,
      "regionKey": "NP_NAMCHE"
    },
    "physicalMetadata": {
      "base_fatigue_score": 8,
      "terrain_type": "HILLY",
      "estimated_duration_min": 480,  // 从 Trail 表获取
      "intensity_factor": 2.0
    }
  }
}
```

---

## 数据填充工作流

### 完整的数据增强流程

```bash
# 步骤1: 计算统计中位数（快招2）
npx ts-node --project tsconfig.backend.json scripts/calculate-median-duration-by-similar-poi.ts

# 步骤2: 解析 OSM opening_hours（快招1）
npx ts-node --project tsconfig.backend.json scripts/enrich-poi-with-osm-opening-hours.ts

# 步骤3: 为徒步类 POI 关联 Trail（需要手动脚本，见下文）
# ...

# 步骤4: 验证结果
# 查询几个样本 POI 查看 metadata 和 physicalMetadata
```

---

## 代码集成示例

### 在数据导入时使用 OSM 解析器

```typescript
import { OsmOpeningHoursParser } from '../common/utils/osm-opening-hours-parser.util';

// 导入 OSM POI 数据时
const osmPoi = {
  tags: {
    name: '某景点',
    opening_hours: 'Mo-Fr 09:00-18:00; Sa-Su 10:00-16:00',
  },
};

// 解析 opening_hours
const openingHours = OsmOpeningHoursParser.parse(osmPoi.tags.opening_hours);

// 创建 Place
await prisma.place.create({
  data: {
    nameCN: osmPoi.tags.name,
    category: 'ATTRACTION',
    metadata: {
      openingHours: openingHours,  // 结构化的 openingHours
      rawTags: osmPoi.tags,        // 保留原始 tags
    },
  },
});
```

### 在创建 Place 时自动增强 metadata

```typescript
import { MetadataEnricher } from './utils/metadata-enricher.util';

// 在 PlacesService.createPlace 中
const enrichedMetadata = MetadataEnricher.enrich(dto.metadata);

const place = await this.prisma.place.create({
  data: {
    ...rest,
    metadata: enrichedMetadata,
  },
});
```

---

## 数据优先级说明

### estimated_duration_min 的优先级（快招2）

系统按以下优先级使用游玩时长数据：

1. **officialDurationMin**（官方建议）- 最高优先级
2. **googlePopularTimesDurationMin**（Google Popular Times）
3. **medianDurationBySimilarPoi**（统计中位数）
4. **visitDuration**（字符串解析，如 "2-3小时"）
5. **typicalStay**（如 "HALF_DAY_HIKE"）
6. **category 默认值**（最低优先级）

### 示例

```typescript
const metadata = {
  officialDurationMin: 120,              // ✅ 使用这个（最高优先级）
  googlePopularTimesDurationMin: 90,     // 被覆盖
  medianDurationBySimilarPoi: 75,        // 被覆盖
  visitDuration: "1小时",                // 被覆盖
};

// 生成的 physicalMetadata.estimated_duration_min = 120
```

---

## 故障排查

### 问题1: OSM opening_hours 解析失败

**症状：** 脚本显示"跳过（无法解析）"

**可能原因：**
- OSM 格式不规范
- 包含特殊语法（如 PH off、24/7 变体等）

**解决方法：**
- 检查原始 opening_hours 字符串格式
- 查看 `OsmOpeningHoursParser` 支持的格式
- 对于复杂格式，可能需要手动处理

### 问题2: Trail enrichment 没有生效

**症状：** `findOne` 返回的 physicalMetadata 没有 Trail 数据

**检查清单：**
1. ✅ metadata 中是否包含 `trailId` 或 `routeId`？
2. ✅ Trail 表中是否存在对应的记录？
3. ✅ PlaceTrailEnrichmentService 是否已注册到 PlacesModule？
4. ✅ PlacesService 构造函数中是否正确注入了服务？

**调试方法：**
```typescript
// 检查 Trail 是否存在
const trail = await prisma.trail.findUnique({
  where: { id: metadata.trailId },
});
console.log('Trail:', trail);

// 手动调用 enrichment
const patch = await trailEnrichmentService.enrichFromTrail(metadata);
console.log('Trail Patch:', patch);
```

### 问题3: 统计中位数计算为空

**症状：** 某些分组显示"样本不足"

**可能原因：**
- 组内 POI 数量 < 3（脚本要求至少 3 个）
- 组内 POI 没有有效的 `estimated_duration_min`

**解决方法：**
- 增加样本数量
- 检查 physicalMetadata 是否正确生成
- 降低最小样本要求（修改脚本中的 `if (durations.length < 3)`）

---

## 性能优化建议

### 批量处理

所有脚本都使用批量处理（每批 100 个），避免内存压力。对于大量数据：

```bash
# 可以分批处理不同国家
npx ts-node scripts/calculate-median-duration-by-similar-poi.ts --country CN
npx ts-node scripts/calculate-median-duration-by-similar-poi.ts --country NP
```

### 索引优化

确保数据库有适当的索引：

```sql
-- metadata 字段的 GIN 索引（已存在）
CREATE INDEX IF NOT EXISTS "Place_metadata_idx" ON "Place" USING GIN (metadata);

-- physicalMetadata 字段的索引
CREATE INDEX IF NOT EXISTS "Place_physicalMetadata_idx" ON "Place" USING GIN ("physicalMetadata");
```

---

## 最佳实践

1. **数据导入时**：使用 `MetadataEnricher.enrich()` 自动解析 OSM opening_hours
2. **定期更新**：定期运行统计脚本，更新中位数数据
3. **Trail 关联**：在导入徒步类 POI 时，同时关联 Trail 数据
4. **验证数据**：运行脚本后，抽样检查几个 POI 的数据是否正确

---

## 自动化集成

### createPlace 自动增强

`PlacesService.createPlace` 已自动集成 metadata enrichment：

- ✅ 自动解析 OSM opening_hours（如果存在）
- ✅ 自动生成 physicalMetadata（使用增强后的 metadata）
- ✅ 支持数据源优先级（officialDurationMin > googlePopularTimesDurationMin > medianDurationBySimilarPoi）

**无需额外代码**，创建 Place 时自动生效：

```typescript
await placesService.createPlace({
  nameCN: '某景点',
  category: 'ATTRACTION',
  metadata: {
    rawTags: {
      opening_hours: 'Mo-Fr 09:00-18:00',  // 会自动解析
    },
    officialDurationMin: 120,  // 会自动使用（最高优先级）
  },
  // ...
});
```

### 批量关联 Trail（快招3）

使用脚本为徒步类 POI 批量关联 Trail：

```bash
# 干运行（查看结果但不更新数据库）
npx ts-node --project tsconfig.backend.json scripts/link-poi-to-trail.ts --dry-run

# 实际执行
npx ts-node --project tsconfig.backend.json scripts/link-poi-to-trail.ts

# 仅处理特定国家
npx ts-node --project tsconfig.backend.json scripts/link-poi-to-trail.ts --country=NP
```

脚本会：
- 查找徒步类 POI（accessType=HIKING/TREKKING 或 subCategory 包含 trail/hike/trek）
- 通过坐标匹配或名称匹配找到相关的 Trail
- 更新 POI 的 metadata.trailId

---

## 相关文档

- `QUICK_WINS_IMPLEMENTATION.md` - 详细实现说明
- `QUICK_WINS_IMPLEMENTATION_SUMMARY.md` - 实现总结
- `POI_METADATA_GENERATION_LOGIC.md` - metadata 生成逻辑说明

