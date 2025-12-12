# PhysicalMetadata 体力消耗元数据获取指南

## 📋 概述

`physicalMetadata` 是 Place 表中用于存储地点体力消耗相关信息的 JSONB 字段，用于行程优化和体力模拟计算。

## ✨ 核心特性

### 1. **规则优先级系统** 🎯
- 使用补丁（Patch）系统，避免规则冲突
- 地形类型：使用最高强度优先（STAIRS_ONLY > HILLY > FLAT > ELEVATOR_AVAILABLE）
- 强度系数：乘法叠加，有上限保护
- 时长：visitDuration 优先级高于 typicalStay

### 2. **数据鲁棒性** 🛡️
- 所有数值都经过 `clamp` 限制在合理范围
- 正确处理 `elevationMeters=0` 的情况
- 支持多种时长格式解析（"1.5小时"、"30 min"、"半天"等）
- 类型安全的枚举常量，减少字符串魔法值

### 3. **可维护性** 🔧
- 集中定义常量（`physical-metadata-constants.ts`）
- 规则来源追踪（每个补丁都有 `source` 字段）
- 统一的规范化流程（`normalize` 函数）

## 🎯 数据来源

### 1. **自动生成（推荐）** ✅

使用 `PhysicalMetadataGenerator` 工具类根据地点类别和现有 metadata 自动生成：

```typescript
import { PhysicalMetadataGenerator } from '../places/utils/physical-metadata-generator.util';
import { PlaceCategory } from '@prisma/client';

// 根据类别生成默认值
const physicalMetadata = PhysicalMetadataGenerator.generateByCategory(
  PlaceCategory.ATTRACTION,
  place.metadata
);
```

### 2. **从现有 metadata 中提取**

如果 Place 的 `metadata` 中已经包含相关信息，可以自动提取：

#### 自然 POI 数据源
- `trailDifficulty` → 推断 `terrain_type` 和 `intensity_factor`
- `accessType` → 推断地形和强度
- `elevationMeters` → 高海拔地区增加强度
- `typicalStay` → 推断游玩时长和强度
- `subCategory` → 根据子类别推断（如火山、冰川等）

#### 马蜂窝数据源
- `visitDuration` → 解析为 `estimated_duration_min`
- `tags` → 从标签推断强度（如"徒步"、"爬山"等）

### 3. **手动设置**

对于特殊地点，可以手动设置：

```typescript
const physicalMetadata: PhysicalMetadata = {
  base_fatigue_score: 8,        // 每10分钟消耗8点HP
  terrain_type: 'HILLY',        // 山地地形
  seated_ratio: 0,              // 0% 时间坐着
  intensity_factor: 1.8,         // 高强度（1.8倍）
  has_elevator: false,           // 无电梯
  wheelchair_accessible: false,  // 无无障碍设施
  estimated_duration_min: 240,   // 预估4小时
};
```

## 📊 字段说明

### `base_fatigue_score` (必需)
- **含义**：每10分钟游玩消耗多少HP（体力值）
- **默认值**：5
- **范围**：1-10
- **示例**：
  - 餐厅：2（低消耗）
  - 博物馆：4（低-中）
  - 普通景点：5（中等）
  - 徒步：8（高消耗）

### `terrain_type` (必需)
- **含义**：地形类型
- **可选值**：
  - `'FLAT'` - 平地
  - `'HILLY'` - 山地/坡地
  - `'STAIRS_ONLY'` - 只有楼梯
  - `'ELEVATOR_AVAILABLE'` - 有电梯可用
- **默认值**：`'FLAT'`

### `seated_ratio` (必需)
- **含义**：坐着的时间比例（0.0 - 1.0）
- **默认值**：0.2
- **示例**：
  - 剧院：1.0（100% 坐着）
  - 博物馆：0.2（20% 坐着）
  - 爬山：0.0（0% 坐着）

### `intensity_factor` (可选)
- **含义**：强度系数（1.0 = 标准，1.5 = 高强度，0.5 = 低强度）
- **默认值**：1.0
- **范围**：0.3 - 2.0

### `has_elevator` (可选)
- **含义**：是否有电梯/缆车
- **默认值**：`false`

### `wheelchair_accessible` (可选)
- **含义**：是否有无障碍设施
- **默认值**：`false`

### `estimated_duration_min` (可选)
- **含义**：预估游玩时长（分钟）
- **默认值**：60
- **示例**：
  - 拍照点：15分钟
  - 短途步行：30分钟
  - 半天徒步：240分钟（4小时）

## 🔧 使用场景

### 场景1：创建新地点时自动生成

```typescript
// 在 PlacesService.createPlace 中
const physicalMetadata = PhysicalMetadataGenerator.generateByCategory(
  dto.category,
  dto.metadata
);

await prisma.place.create({
  data: {
    ...dto,
    physicalMetadata: physicalMetadata as any,
  },
});
```

### 场景2：批量更新现有地点

```typescript
// 脚本：scripts/generate-physical-metadata.ts
const places = await prisma.place.findMany({
  where: { physicalMetadata: null },
});

for (const place of places) {
  const physicalMetadata = PhysicalMetadataGenerator.generateByCategory(
    place.category,
    place.metadata as any
  );
  
  await prisma.place.update({
    where: { id: place.id },
    data: { physicalMetadata: physicalMetadata as any },
  });
}
```

### 场景3：从自然 POI 导入时生成

```typescript
// 在 NaturePoiService.saveNaturePoiAsPlace 中
const physicalMetadata = PhysicalMetadataGenerator.generateFromNaturePoi(
  poiMetadata
);

await prisma.place.create({
  data: {
    ...placeData,
    physicalMetadata: physicalMetadata as any,
  },
});
```

## 📝 数据映射规则

### 规则优先级（从高到低）

1. **trailDifficulty**（最高优先级）
   - 直接决定地形类型和基础强度
   - 不会被其他规则覆盖

2. **accessType**
   - 影响地形和 seated_ratio
   - 但地形优先级低于 trailDifficulty

3. **typicalStay**
   - 影响时长和强度
   - 但地形可能被 trailDifficulty 覆盖

4. **elevationMeters**
   - 高海拔（>2000m）增加强度系数 ×1.3
   - 不改变地形类型

5. **visitDuration**
   - 覆盖时长（优先级高于 typicalStay）

6. **facilities**
   - 影响无障碍设施标志

7. **subCategory**
   - 优先级最低，用于补充推断

### 根据类别默认值

| 类别 | base_fatigue_score | terrain_type | seated_ratio | intensity_factor | duration_min |
|------|-------------------|--------------|--------------|------------------|--------------|
| ATTRACTION | 5 | FLAT | 0.2 | 1.0 | 60 |
| RESTAURANT | 2 | FLAT | 0.9 | 0.3 | 60 |
| SHOPPING | 4 | FLAT | 0.1 | 0.8 | 90 |
| HOTEL | 1 | ELEVATOR_AVAILABLE | 0.95 | 0.2 | 480 |
| TRANSIT_HUB | 4 | FLAT | 0.3 | 0.9 | 30 |

### 根据 trailDifficulty 映射（最高优先级）

| 难度 | terrain_type | intensity_factor | base_fatigue_score |
|------|--------------|------------------|-------------------|
| EASY | FLAT | 0.7 | 4 |
| MODERATE | HILLY | 1.2 | 6 |
| HARD | STAIRS_ONLY | 1.8 | 8 |
| EXTREME | STAIRS_ONLY | 2.0 | 9 |

### 根据 typicalStay 映射

| 停留类型 | duration_min | terrain_type | intensity_factor | seated_ratio |
|---------|--------------|--------------|------------------|--------------|
| PHOTO_STOP | 15 | FLAT | 0.6 | 0.1 |
| SHORT_WALK | 30 | FLAT | 0.8 | 0 |
| HALF_DAY_HIKE | 240 | HILLY* | 1.5 | 0 |
| FULL_DAY_HIKE | 480 | HILLY* | 2.0 | 0 |

*注：如果同时有 trailDifficulty=HARD，地形会被覆盖为 STAIRS_ONLY

### 数值范围限制

所有数值在最终返回前都会经过 `normalize` 函数限制：

| 字段 | 最小值 | 最大值 | 说明 |
|------|--------|--------|------|
| base_fatigue_score | 1 | 10 | 四舍五入到整数 |
| intensity_factor | 0.2 | 2.5 | 保留原值 |
| seated_ratio | 0 | 1 | 保留原值 |
| estimated_duration_min | 5 | 720 | 四舍五入到整数（5分钟到12小时） |

### 时长解析支持格式

`parseDuration` 函数支持以下格式：

- ✅ `"1小时"` / `"1-2小时"` / `"1.5小时"`
- ✅ `"30分钟"` / `"30 min"` / `"30min"`
- ✅ `"半天"` / `"全天"` / `"一天"`
- ✅ `"约2小时"` / `"2h"` / `"2 h"`
- ✅ `"1.5小时"` → 90分钟

## 🚀 实施建议

### 阶段1：为新创建的地点自动生成
- 在 `PlacesService.createPlace` 中集成 `PhysicalMetadataGenerator`
- 在 `NaturePoiService.saveNaturePoiAsPlace` 中生成

### 阶段2：批量更新现有地点
- 创建脚本批量生成缺失的 `physicalMetadata`
- 优先处理有 `metadata.trailDifficulty` 或 `metadata.visitDuration` 的地点

### 阶段3：持续优化
- 根据实际使用情况调整默认值
- 收集用户反馈优化算法

## 📚 相关文件

- `src/places/interfaces/physical-metadata.interface.ts` - 接口定义
- `src/places/utils/physical-metadata-generator.util.ts` - 生成工具
- `src/trips/utils/hp-simulator.util.ts` - 使用 physicalMetadata 进行体力模拟
- `src/itinerary-optimization/itinerary-optimization.service.ts` - 路线优化中使用
