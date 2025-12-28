# 尼泊尔 POI Metadata 优化分析

## 📊 当前数据结构分析

### 示例 Metadata
```json
{
  "osmId": 4509914391,
  "osmType": "node",
  "profile": "Trekking Core",
  "rawTags": {
    "amenity": "shelter",
    "profile": "Trekking Core",
    "region_key": "NP_KTM",
    "internet_access": "wlan"
  },
  "regionKey": "NP_KTM",
  "canonicalType": "HUT"
}
```

## 🔍 字段分析

### 1. **canonicalType** ✅ 已优化
- **位置**: `metadata.canonicalType` (顶层)
- **使用情况**: 大量查询使用 `metadata->>'canonicalType'`
- **建议**: **保持现状**，不需要提取到顶层字段
- **原因**: 
  - 已在metadata顶层，查询方便
  - 通过JSONB索引可以高效查询
  - 属于扩展信息，不需要独立字段

### 2. **internet_access** ⚠️ 需要优化
- **位置**: `metadata.rawTags.internet_access`
- **当前状态**: 只在rawTags中，未结构化
- **使用情况**: 目前未被查询使用
- **建议**: **提取到 `metadata.facilities.internet`**
- **原因**:
  - 对徒步者很重要（特别是在偏远地区）
  - 目前PlaceMetadata接口的facilities中没有internet字段
  - 需要结构化以便查询和过滤

### 3. **amenity** ✅ 已映射
- **位置**: `metadata.rawTags.amenity`
- **当前状态**: 已通过canonicalType映射（如 "shelter" → "HUT"）
- **建议**: **保持现状**，不需要额外提取

### 4. **profile** ✅ 已优化
- **位置**: `metadata.profile` (顶层)
- **建议**: **保持现状**

## 💡 优化建议

### 方案1: 扩展 facilities 结构（推荐）

**优点**:
- 不改变表结构，只需优化metadata内容
- 符合现有的facilities设计模式
- 便于查询和过滤

**实施步骤**:
1. 扩展 `PlaceMetadata` 接口，添加 `internet` 字段
2. 创建脚本，从 `rawTags.internet_access` 提取到 `facilities.internet`
3. 支持查询：`metadata->'facilities'->>'internet'`

**需要提取的字段**:
- `internet_access` → `facilities.internet` (boolean 或 string)
- 其他可能的设施信息（如 `drinking_water`, `toilets` 等）

### 方案2: 保持现状

**优点**:
- 不需要修改代码
- rawTags保留完整原始数据

**缺点**:
- 无法高效查询设施信息
- 前端展示需要从rawTags中解析

## 🎯 推荐方案

**建议采用方案1**，原因：

1. **用户体验**: 徒步者需要知道哪些地方有WiFi
2. **查询效率**: 结构化数据便于过滤（如"查找有WiFi的山屋"）
3. **扩展性**: 未来可以添加更多设施信息（饮用水、厕所等）
4. **一致性**: 与现有的facilities结构保持一致

## 📝 需要提取的 OSM 字段映射

| OSM rawTags 字段 | 目标位置 | 类型 | 说明 |
|-----------------|---------|------|------|
| `internet_access` | `facilities.internet` | boolean/string | WiFi可用性 |
| `drinking_water` | `facilities.drinkingWater` | boolean | 饮用水 |
| `toilets` | `facilities.toilets` | boolean | 厕所 |
| `shelter` | 已映射到 `canonicalType` | - | 通过canonicalType体现 |

## 🔧 实施状态

### ✅ 已完成

1. **扩展接口** (`src/places/interfaces/place-metadata.interface.ts`):
   - 已添加 `internet` 字段（包含 available 和 type）
   - 已添加 `drinkingWater` 字段
   - 已添加 `toilets` 字段

2. **创建优化脚本** (`scripts/optimize-nepal-poi-metadata.ts`):
   - 从 `rawTags` 提取设施信息
   - 更新 `metadata.facilities`
   - 保留 `rawTags` 原始数据
   - 支持批量处理

### 📝 使用方法

```bash
# 运行优化脚本
npm run optimize:nepal-poi-metadata
```

脚本会：
- 扫描所有尼泊尔 POI（`regionKey LIKE 'NP_%'`）
- 从 `rawTags` 提取设施信息到 `facilities`
- 显示处理进度和统计信息

### 🔍 查询示例

优化后，可以使用以下查询：

```sql
-- 查找有 WiFi 的 POI
SELECT * FROM "Place"
WHERE metadata->>'regionKey' LIKE 'NP_%'
  AND metadata->'facilities'->'internet'->>'available' = 'true';

-- 查找有饮用水的 POI
SELECT * FROM "Place"
WHERE metadata->>'regionKey' LIKE 'NP_%'
  AND metadata->'facilities'->>'drinkingWater' = 'true';

-- 查找有厕所的 POI
SELECT * FROM "Place"
WHERE metadata->>'regionKey' LIKE 'NP_%'
  AND metadata->'facilities'->>'toilets' = 'true';
```

### 🚀 后续优化（可选）

1. **更新查询逻辑** (如需要):
   - 在 PlacesService 中添加按设施过滤的方法
   - 在API响应中包含设施信息

2. **前端展示**:
   - 在POI详情中显示设施图标
   - 支持按设施筛选POI列表

## ⚠️ 注意事项

1. **不要删除 rawTags**: 保留原始OSM数据作为备份
2. **向后兼容**: 确保现有查询不受影响
3. **批量处理**: 使用事务批量更新，避免性能问题
4. **数据验证**: 确保提取的数据格式正确

## 📊 影响评估

- **表结构**: 无需修改 ✅
- **现有查询**: 不受影响 ✅
- **新功能**: 支持设施过滤 ✅
- **数据量**: 增加少量metadata大小（可接受）✅

