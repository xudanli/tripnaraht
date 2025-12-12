# PhysicalMetadata 评估所需字段说明

## 📋 概述

本文档说明评估体力消耗元数据（`physicalMetadata`）需要提供哪些字段信息，以及这些字段的格式、优先级和来源。

## ✅ 必需字段

### 1. `category` (PlaceCategory)

**类型**: `PlaceCategory` 枚举  
**必需**: ✅ 是  
**说明**: 地点类别，用于生成默认的体力消耗值

**可选值**:
- `ATTRACTION` - 景点（默认：中等强度）
- `RESTAURANT` - 餐厅（默认：低强度，90% 时间坐着）
- `SHOPPING` - 购物（默认：低到中等强度）
- `HOTEL` - 酒店（默认：极低强度，95% 时间坐着）
- `TRANSIT_HUB` - 交通枢纽（默认：中等强度）

**示例**:
```typescript
{
  category: PlaceCategory.ATTRACTION
}
```

**默认值**:
- `base_fatigue_score: 5`
- `terrain_type: 'FLAT'`
- `seated_ratio: 0.2`
- `intensity_factor: 1.0`
- `estimated_duration_min: 60`

**如何获取**:
- **自然 POI 数据**: 固定为 `ATTRACTION`（自动设置）
- **马蜂窝景点**: 固定为 `ATTRACTION`（自动设置）
- **酒店推荐**: 固定为 `HOTEL`（自动设置）
- **用户手动创建**: 通过 API 传入（必需字段）
- **Google Places**: 需要从 `types` 字段映射（建议实现自动推断工具）

📖 **详细说明**: 参见 [`docs/PLACE-CATEGORY-GUIDE.md`](./PLACE-CATEGORY-GUIDE.md)

---

## 🎯 可选增强字段（按优先级排序）

这些字段可以放在 `Place.metadata` (JSONB) 中，用于更精确地评估体力消耗。

### 优先级 1: `trailDifficulty` ⭐⭐⭐⭐⭐

**类型**: `string`  
**必需**: ❌ 否（但强烈推荐用于自然景点）  
**优先级**: 最高（会覆盖其他规则的地形类型）  
**说明**: 徒步/活动难度等级

**可选值**:
- `"EASY"` / `"easy"` - 简单
- `"MODERATE"` / `"moderate"` - 中等
- `"HARD"` / `"hard"` - 困难
- `"EXTREME"` / `"extreme"` - 极难

**影响**:
| 难度 | terrain_type | intensity_factor | base_fatigue_score |
|------|--------------|------------------|-------------------|
| EASY | FLAT | 0.7 | 4 |
| MODERATE | HILLY | 1.2 | 6 |
| HARD | STAIRS_ONLY | 1.8 | 8 |
| EXTREME | STAIRS_ONLY | 2.0 | 9 |

**示例**:
```typescript
{
  metadata: {
    trailDifficulty: "HARD"
  }
}
```

**数据来源**:
- 自然 POI 数据（冰岛自然景点）
- 用户手动标注
- 从活动描述中提取

---

### 优先级 2: `accessType` ⭐⭐⭐⭐

**类型**: `string`  
**必需**: ❌ 否  
**优先级**: 高（影响地形和 seated_ratio）  
**说明**: 到达/访问方式

**可选值**:
- `"WALKING"` - 步行
- `"HIKING"` - 徒步
- `"TREKKING"` - 长途徒步
- `"VEHICLE"` - 车辆
- `"BOAT"` - 船只
- `"CABLE_CAR"` - 缆车

**影响**:
- `HIKING` / `TREKKING` → `terrain_type: HILLY`, `intensity_factor: 1.5`, `seated_ratio: 0`
- `VEHICLE` / `BOAT` → `seated_ratio: 0.8`, `intensity_factor: 0.6`
- `CABLE_CAR` → `terrain_type: ELEVATOR_AVAILABLE`, `has_elevator: true`, `seated_ratio: 0.7`

**示例**:
```typescript
{
  metadata: {
    accessType: "HIKING"
  }
}
```

**数据来源**:
- 自然 POI 数据
- 从交通信息中推断

---

### 优先级 3: `typicalStay` ⭐⭐⭐

**类型**: `string`  
**必需**: ❌ 否  
**优先级**: 中（影响时长和强度，但地形可能被 trailDifficulty 覆盖）  
**说明**: 典型停留时间类型

**可选值**:
- `"PHOTO_STOP"` - 拍照点（15分钟）
- `"SHORT_WALK"` - 短途步行（30分钟）
- `"HALF_DAY_HIKE"` - 半天徒步（4小时）
- `"FULL_DAY_HIKE"` - 全天徒步（8小时）

**影响**:
| 停留类型 | duration_min | terrain_type | intensity_factor | seated_ratio |
|---------|--------------|--------------|------------------|--------------|
| PHOTO_STOP | 15 | FLAT | 0.6 | 0.1 |
| SHORT_WALK | 30 | FLAT | 0.8 | 0 |
| HALF_DAY_HIKE | 240 | HILLY* | 1.5 | 0 |
| FULL_DAY_HIKE | 480 | HILLY* | 2.0 | 0 |

*注：如果同时有 `trailDifficulty=HARD`，地形会被覆盖为 `STAIRS_ONLY`

**示例**:
```typescript
{
  metadata: {
    typicalStay: "HALF_DAY_HIKE"
  }
}
```

**数据来源**:
- 自然 POI 数据
- 从游玩时长描述中推断

---

### 优先级 4: `elevationMeters` ⭐⭐⭐

**类型**: `number`  
**必需**: ❌ 否  
**优先级**: 中（高海拔增加强度，但不改变地形）  
**说明**: 海拔高度（米）

**影响**:
- `elevationMeters > 2000` → `intensity_factor × 1.3`（高海拔地区体力消耗增加）
- `elevationMeters <= 2000` → 无影响

**示例**:
```typescript
{
  metadata: {
    elevationMeters: 2500  // 高海拔，强度系数 × 1.3
  }
}
```

**数据来源**:
- 自然 POI 数据（OpenStreetMap）
- 地理数据 API
- 用户标注

**注意**: 
- ✅ `elevationMeters: 0` 会被正确处理（不会跳过）
- ✅ 必须是数字类型，不能是字符串

---

### 优先级 5: `visitDuration` ⭐⭐⭐

**类型**: `string`  
**必需**: ❌ 否  
**优先级**: 中（覆盖时长，优先级高于 typicalStay）  
**说明**: 游玩时长描述（支持多种格式）

**支持的格式**:
- ✅ `"1小时"` / `"1-2小时"` / `"1.5小时"`
- ✅ `"30分钟"` / `"30 min"` / `"30min"`
- ✅ `"半天"` / `"全天"` / `"一天"`
- ✅ `"约2小时"` / `"2h"` / `"2 h"`

**影响**:
- 直接覆盖 `estimated_duration_min`
- 优先级高于 `typicalStay`

**示例**:
```typescript
{
  metadata: {
    visitDuration: "1.5小时"  // 解析为 90 分钟
  }
}
```

**数据来源**:
- 马蜂窝数据（`visitDuration` 字段）
- 用户评论中的时长描述
- 官方介绍

---

### 优先级 6: `facilities` ⭐⭐

**类型**: `object`  
**必需**: ❌ 否  
**优先级**: 低（影响无障碍设施标志）  
**说明**: 设施信息

**结构**:
```typescript
{
  facilities: {
    wheelchair?: {
      hasElevator?: boolean;
      accessible?: boolean;
    }
  }
}
```

**影响**:
- `facilities.wheelchair.hasElevator === true` → `has_elevator: true`, `terrain_type: ELEVATOR_AVAILABLE`
- `facilities.wheelchair.accessible === true` → `wheelchair_accessible: true`

**示例**:
```typescript
{
  metadata: {
    facilities: {
      wheelchair: {
        hasElevator: true,
        accessible: true
      }
    }
  }
}
```

**数据来源**:
- Google Places API
- OpenStreetMap
- 用户标注

---

### 优先级 7: `subCategory` ⭐

**类型**: `string`  
**必需**: ❌ 否  
**优先级**: 最低（用于补充推断）  
**说明**: 子类别（用于特殊类型推断）

**特殊值**:
- 包含 `"volcano"` 或 `"glacier"` → 高强度活动
  - `intensity_factor: 1.8`
  - `terrain_type: HILLY`（可能被 trailDifficulty 覆盖）
  - `base_fatigue_score: 8`
- 包含 `"hot_spring"` 或 `"viewpoint"` → 低强度
  - `intensity_factor: 0.6`
  - `seated_ratio: 0.3`

**示例**:
```typescript
{
  metadata: {
    subCategory: "volcano"  // 火山，高强度
  }
}
```

**数据来源**:
- 自然 POI 数据
- 分类系统

---

## 📊 完整示例

### 示例 1: 简单景点（仅 category）

```typescript
{
  category: PlaceCategory.ATTRACTION,
  metadata: {}
}

// 生成结果:
{
  base_fatigue_score: 5,
  terrain_type: 'FLAT',
  seated_ratio: 0.2,
  intensity_factor: 1.0,
  has_elevator: false,
  wheelchair_accessible: false,
  estimated_duration_min: 60
}
```

### 示例 2: 困难徒步路线（trailDifficulty + accessType）

```typescript
{
  category: PlaceCategory.ATTRACTION,
  metadata: {
    trailDifficulty: "HARD",
    accessType: "HIKING",
    elevationMeters: 2500,
    typicalStay: "HALF_DAY_HIKE"
  }
}

// 生成结果:
{
  base_fatigue_score: 8,  // 来自 trailDifficulty
  terrain_type: 'STAIRS_ONLY',  // 来自 trailDifficulty（最高优先级）
  seated_ratio: 0,  // 来自 accessType
  intensity_factor: 2.34,  // 1.8 (HARD) × 1.5 (HIKING) × 1.3 (高海拔) → clamp 到 2.5
  has_elevator: false,
  wheelchair_accessible: false,
  estimated_duration_min: 240  // 来自 typicalStay
}
```

### 示例 3: 餐厅（category 已足够）

```typescript
{
  category: PlaceCategory.RESTAURANT,
  metadata: {}
}

// 生成结果:
{
  base_fatigue_score: 2,
  terrain_type: 'FLAT',
  seated_ratio: 0.9,  // 90% 时间坐着
  intensity_factor: 0.3,
  has_elevator: false,
  wheelchair_accessible: false,
  estimated_duration_min: 60
}
```

### 示例 4: 马蜂窝景点（visitDuration）

```typescript
{
  category: PlaceCategory.ATTRACTION,
  metadata: {
    visitDuration: "约2小时",
    facilities: {
      wheelchair: {
        hasElevator: true
      }
    }
  }
}

// 生成结果:
{
  base_fatigue_score: 5,
  terrain_type: 'ELEVATOR_AVAILABLE',  // 来自 facilities
  seated_ratio: 0.2,
  intensity_factor: 1.0,
  has_elevator: true,  // 来自 facilities
  wheelchair_accessible: false,
  estimated_duration_min: 120  // 来自 visitDuration（优先级高于默认值）
}
```

---

## 🔍 字段获取建议

### 数据源优先级

1. **自然 POI 数据**（最完整）
   - ✅ `trailDifficulty`
   - ✅ `accessType`
   - ✅ `elevationMeters`
   - ✅ `typicalStay`
   - ✅ `subCategory`

2. **马蜂窝数据**
   - ✅ `visitDuration`（需要解析）

3. **Google Places API**
   - ✅ `facilities.wheelchair`

4. **OpenStreetMap**
   - ✅ `elevationMeters`
   - ✅ `facilities`

5. **用户标注**
   - ✅ 所有字段都可以手动补充

---

## 📝 最小化数据要求

### 场景 1: 只有类别信息

**提供**: `category`  
**结果**: 使用类别默认值（足够用于大多数场景）

### 场景 2: 自然景点（推荐）

**提供**: 
- `category: ATTRACTION`
- `metadata.trailDifficulty`
- `metadata.accessType`（可选）
- `metadata.elevationMeters`（可选）

**结果**: 精确的体力消耗评估

### 场景 3: 城市景点

**提供**:
- `category: ATTRACTION`
- `metadata.visitDuration`（从马蜂窝获取）
- `metadata.facilities`（从 Google Places 获取，可选）

**结果**: 合理的体力消耗评估

---

## ⚠️ 注意事项

1. **字段优先级**: `trailDifficulty` 会覆盖其他规则的地形类型
2. **数值类型**: `elevationMeters` 必须是 `number`，不能是字符串
3. **时长格式**: `visitDuration` 支持多种格式，但建议使用标准格式（如 "1.5小时"）
4. **字段缺失**: 所有增强字段都是可选的，系统会根据 `category` 提供合理的默认值
5. **数值收敛**: 所有数值最终都会经过 `clamp` 限制在合理范围，不会出现异常值

---

## 🚀 快速参考

| 字段 | 类型 | 必需 | 优先级 | 主要影响 |
|------|------|------|--------|----------|
| `category` | `PlaceCategory` | ✅ | - | 基础默认值 |
| `trailDifficulty` | `string` | ❌ | ⭐⭐⭐⭐⭐ | 地形、强度、疲劳分数 |
| `accessType` | `string` | ❌ | ⭐⭐⭐⭐ | 地形、seated_ratio |
| `typicalStay` | `string` | ❌ | ⭐⭐⭐ | 时长、强度 |
| `elevationMeters` | `number` | ❌ | ⭐⭐⭐ | 强度系数 |
| `visitDuration` | `string` | ❌ | ⭐⭐⭐ | 时长 |
| `facilities` | `object` | ❌ | ⭐⭐ | 无障碍设施 |
| `subCategory` | `string` | ❌ | ⭐ | 补充推断 |
