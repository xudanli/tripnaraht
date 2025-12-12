# PhysicalMetadata 生成器改进说明

## 🎯 改进目标

提升体力消耗评分的：
- **稳定性**：规则冲突有明确的优先级
- **可解释性**：每个规则都有来源追踪
- **鲁棒性**：对脏数据有边界保护

## 🔧 主要改进

### 1. 规则优先级系统

#### 问题
之前的实现中，规则可能互相覆盖：
- `trailDifficulty=HARD` 设置 `terrain_type=STAIRS_ONLY`
- 但 `typicalStay=HALF_DAY_HIKE` 又改回 `HILLY`
- 结果不确定，取决于执行顺序

#### 解决方案
引入**补丁（Patch）系统**：

```typescript
// 每个规则生成一个补丁
const patches: PhysicalMetadataPatch[] = [
  patchFromTrailDifficulty('HARD'),      // 优先级1
  patchFromAccessType('HIKING'),         // 优先级2
  patchFromTypicalStay('HALF_DAY_HIKE'), // 优先级3
  // ...
];

// 智能合并：地形类型使用最高强度
// intensity_factor 乘法叠加
// 其他字段：后面的覆盖前面的
const result = mergePatches(base, patches);
```

#### 优先级规则

1. **地形类型**：使用最高强度优先
   - `STAIRS_ONLY` (强度3) > `HILLY` (强度2) > `FLAT` (强度1) > `ELEVATOR_AVAILABLE` (强度1)
   - 如果 `trailDifficulty=HARD` 设置 `STAIRS_ONLY`，`typicalStay` 的 `HILLY` 不会覆盖它

2. **强度系数**：乘法叠加，有上限
   - `intensity_factor = base * rule1 * rule2 * ...`
   - 最终限制在 0.2 - 2.5 之间

3. **时长**：`visitDuration` 优先级高于 `typicalStay`
   - 因为 `visitDuration` 通常更具体（如"1.5小时"）

### 2. 边界与脏数据鲁棒性

#### 问题修复

**问题1：`elevationMeters=0` 被跳过**
```typescript
// ❌ 旧代码
if (metadata.elevationMeters) { ... }  // 0 会被跳过

// ✅ 新代码
if (this.isValidNumber(metadata.elevationMeters)) { ... }
// 正确处理 0 值
```

**问题2：数值范围缺乏收敛**
```typescript
// ✅ 新增 normalize 函数
private static normalize(metadata: PhysicalMetadata): PhysicalMetadata {
  return {
    base_fatigue_score: clamp(score, 1, 10),
    seated_ratio: clamp(ratio, 0, 1),
    intensity_factor: clamp(factor, 0.2, 2.5),
    estimated_duration_min: clamp(duration, 5, 720),
    // ...
  };
}
```

**问题3：`parseDuration` 覆盖面不足**
```typescript
// ✅ 扩展支持
- "1.5小时" → 90分钟
- "约2小时" → 120分钟
- "2h" → 120分钟
- "半天" → 240分钟
- "全天" → 480分钟
- "30 min" → 30分钟
```

### 3. 可维护性与扩展性

#### 问题
- 字符串魔法值散落各处（`'HARD'`, `'HIKING'`, `'PHOTO_STOP'`）
- 未来添加新规则需要修改多处代码
- 难以追踪规则来源

#### 解决方案

**1. 集中定义常量**
```typescript
// physical-metadata-constants.ts
export const TERRAIN_TYPES = {
  FLAT: 'FLAT',
  HILLY: 'HILLY',
  STAIRS_ONLY: 'STAIRS_ONLY',
  ELEVATOR_AVAILABLE: 'ELEVATOR_AVAILABLE',
} as const;

export const TRAIL_DIFFICULTY = {
  EASY: 'EASY',
  MODERATE: 'MODERATE',
  HARD: 'HARD',
  EXTREME: 'EXTREME',
} as const;
```

**2. 规则来源追踪**
```typescript
interface PhysicalMetadataPatch {
  // ... 字段 ...
  source?: string; // 'trailDifficulty:HARD', 'accessType:HIKING', etc.
}
```

**3. 类型安全**
```typescript
// 使用类型而不是字符串
type TerrainType = typeof TERRAIN_TYPES[keyof typeof TERRAIN_TYPES];
type TrailDifficulty = typeof TRAIL_DIFFICULTY[keyof typeof TRAIL_DIFFICULTY];
```

### 4. 字段一致性

#### 问题
- `getDefaultByCategory` 返回的默认值缺少 `has_elevator` 和 `wheelchair_accessible`
- 但在 `enhanceFromMetadata` 中会设置这些字段

#### 解决方案
- ✅ 所有默认值都包含完整字段
- ✅ 使用 `??` 操作符确保字段存在

## 📊 改进效果

### 之前的问题

```typescript
// 规则冲突
trailDifficulty='HARD' → terrain_type='STAIRS_ONLY'
typicalStay='HALF_DAY_HIKE' → terrain_type='HILLY'  // 覆盖了！

// 脏数据
elevationMeters=0 → 被跳过
visitDuration="半天" → 解析失败

// 数值溢出
intensity_factor = 1.0 * 1.5 * 1.8 * 1.3 = 3.51  // 超出合理范围
```

### 现在的行为

```typescript
// 规则优先级明确
trailDifficulty='HARD' → terrain_type='STAIRS_ONLY' (优先级最高)
typicalStay='HALF_DAY_HIKE' → 不影响地形，只影响时长和强度

// 正确处理边界
elevationMeters=0 → 正确识别为有效值（但 < 2000，不增加强度）
visitDuration="半天" → 解析为 240 分钟

// 数值收敛
intensity_factor = clamp(1.0 * 1.5 * 1.8 * 1.3, 0.2, 2.5) = 2.5
```

## 🚀 使用示例

### 示例1：规则优先级

```typescript
const metadata = {
  trailDifficulty: 'HARD',        // 优先级1
  typicalStay: 'HALF_DAY_HIKE',  // 优先级3
  elevationMeters: 2500,         // 优先级4
};

// 结果：
// - terrain_type: 'STAIRS_ONLY' (来自 trailDifficulty，不会被 typicalStay 覆盖)
// - intensity_factor: 1.8 * 1.3 = 2.34 → clamp 到 2.5
// - estimated_duration_min: 240 (来自 typicalStay)
```

### 示例2：时长解析

```typescript
parseDuration("1.5小时")    // → 90
parseDuration("约2小时")     // → 120
parseDuration("半天")        // → 240
parseDuration("30 min")      // → 30
parseDuration("1-2小时")     // → 90 (平均值)
```

### 示例3：数值收敛

```typescript
// 即使多个规则叠加，最终也会收敛到合理范围
const result = normalize({
  base_fatigue_score: 15,        // → clamp(15, 1, 10) = 10
  seated_ratio: -0.5,            // → clamp(-0.5, 0, 1) = 0
  intensity_factor: 5.0,         // → clamp(5.0, 0.2, 2.5) = 2.5
  estimated_duration_min: 2000,  // → clamp(2000, 5, 720) = 720
});
```

## 📚 相关文件

- `src/places/utils/physical-metadata-generator.util.ts` - 主生成器
- `src/places/utils/physical-metadata-constants.ts` - 常量定义
- `src/places/interfaces/physical-metadata.interface.ts` - 接口定义
- `docs/PHYSICAL-METADATA-GUIDE.md` - 使用指南

## 🔮 未来扩展

### 可能的改进方向

1. **规则配置化**
   - 将规则映射表移到配置文件或数据库
   - 支持动态调整规则权重

2. **机器学习增强**
   - 根据用户实际体力消耗数据调整参数
   - 个性化强度系数

3. **多数据源融合**
   - 整合 Google Places、OpenStreetMap 等数据源
   - 交叉验证提高准确性
