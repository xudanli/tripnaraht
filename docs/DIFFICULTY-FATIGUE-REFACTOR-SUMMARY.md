# Difficulty vs Fatigue 分轨道重构总结

## ✅ 重构完成

已成功实现"分轨道"架构，将 `trailDifficulty`（难度）和 `physical fatigue`（疲劳）分离。

## 🔧 主要变更

### 1. 创建独立的数据结构

**新增文件**: `src/places/interfaces/trail-difficulty.interface.ts`

```typescript
export interface TrailDifficultyMetadata {
  level: 'EASY' | 'MODERATE' | 'HARD' | 'EXTREME';
  technicalGrade?: number;
  riskFactors?: string[];
  requiresEquipment?: boolean;
  requiresGuide?: boolean;
  source?: 'alltrails' | 'komoot' | 'official' | 'community' | 'manual';
  confidence?: number;
}
```

**关键点**:
- Difficulty 关注：技术性、风险、门槛
- 不关注：距离、时间（这些属于 Fatigue）

### 2. 创建独立的 Difficulty 评估器

**新增文件**: `src/places/utils/trail-difficulty-assessor.util.ts`

```typescript
export class TrailDifficultyAssessor {
  static assess(metadata: any): TrailDifficultyMetadata | null {
    // 优先级：
    // 1. 官方/专业平台评级
    // 2. 技术等级
    // 3. 风险因素
    // 4. 子类别推断
  }
}
```

**评估优先级**:
1. 官方/专业平台评级（AllTrails, Komoot）→ 置信度 0.9
2. 技术等级（technicalGrade）→ 置信度 0.8
3. 风险因素（riskFactors）→ 置信度 0.7
4. 子类别推断（subCategory）→ 置信度 0.3-0.5

### 3. 重构 PhysicalMetadataGenerator

**修改文件**: `src/places/utils/physical-metadata-generator.util.ts`

#### 变更前（错误做法）:
```typescript
// ❌ trailDifficulty 直接决定 fatigue
if (trailDifficulty === 'HARD') {
  terrain_type = 'STAIRS_ONLY';
  intensity_factor = 1.8;
  base_fatigue_score = 8;
}
```

#### 变更后（正确做法）:
```typescript
// ✅ 先独立计算 fatigue（不依赖 difficulty）
const enhanced = this.mergePatches(base, patches);

// ✅ 最后用 difficulty 微调（只调 5-15%）
const final = this.applyDifficultyModifier(enhanced, metadata.trailDifficulty);
```

#### 新的弱耦合调制器:

```typescript
private static applyDifficultyModifier(
  metadata: PhysicalMetadata,
  trailDifficulty?: string
): PhysicalMetadata {
  // 只微调 intensity_factor（5-15%）
  const modifier = {
    'EASY': 0.95,      // -5%
    'MODERATE': 1.0,   // 基准
    'HARD': 1.1,       // +10%
    'EXTREME': 1.15,   // +15%
  };
  
  return {
    ...metadata,
    intensity_factor: (metadata.intensity_factor || 1.0) * modifier,
  };
}
```

**关键改进**:
- ✅ 移除了 `patchFromTrailDifficulty` 中对 `terrain_type`、`base_fatigue_score` 的直接决定
- ✅ `trailDifficulty` 不再影响 `terrain_type`（地形由 `accessType` 决定）
- ✅ `trailDifficulty` 不再影响 `base_fatigue_score`（疲劳由物理因素决定）
- ✅ `trailDifficulty` 只微调 `intensity_factor`（5-15%）

## 📊 效果对比

### 场景 1: 8 小时缓坡徒步

**变更前**:
```
trailDifficulty = HARD（因为"8小时"很长）
→ terrain_type = STAIRS_ONLY（错误！）
→ base_fatigue_score = 8（可能过高）
```

**变更后**:
```
trailDifficulty = EASY（技术难度低）
→ terrain_type = HILLY（由 accessType 决定）
→ base_fatigue_score = 6（由物理因素决定）
→ intensity_factor × 0.95（EASY 微调 -5%）
→ 结果：不难但累，符合实际
```

### 场景 2: 2 小时技术攀爬

**变更前**:
```
trailDifficulty = HARD
→ base_fatigue_score = 8（过高！）
→ 行程规划认为"很累"，安排大量休息
```

**变更后**:
```
trailDifficulty = HARD（技术门槛高）
→ base_fatigue_score = 5（由物理因素决定：时间短、距离短）
→ intensity_factor × 1.1（HARD 微调 +10%）
→ 结果：难但不累，可以连续安排
```

## 🎯 架构原则

### Track A: Trail Difficulty（是否"难"）

- **问题类型**: 分类问题（离散）
- **核心关注**: 技术性、风险、门槛
- **输出**: EASY / MODERATE / HARD / EXTREME
- **数据来源**: AllTrails, Komoot, 官方评级, 风险因素

### Track B: Physical Fatigue（有多累）

- **问题类型**: 连续预测问题
- **核心关注**: 时长、强度、消耗
- **输出**: 连续值（1-10 分）
- **数据来源**: 距离、爬升、坡度、时长、海拔

### 弱耦合联动

```
final_fatigue = 
  base_fatigue
  × terrain_multiplier
  × altitude_multiplier
  × difficulty_modifier  ← 只微调（5-15%），不可翻倍
```

## 📝 使用示例

### 生成独立的 Difficulty Metadata

```typescript
import { TrailDifficultyAssessor } from './utils/trail-difficulty-assessor.util';

const difficultyMetadata = TrailDifficultyAssessor.assess(place.metadata);
// {
//   level: 'HARD',
//   technicalGrade: 3,
//   riskFactors: ['exposure', 'rope'],
//   requiresEquipment: true,
//   source: 'official',
//   confidence: 0.9
// }
```

### 生成独立的 Fatigue Metadata

```typescript
import { PhysicalMetadataGenerator } from './utils/physical-metadata-generator.util';

const fatigueMetadata = PhysicalMetadataGenerator.generateByCategory(
  place.category,
  place.metadata
);
// {
//   base_fatigue_score: 5,
//   terrain_type: 'HILLY',
//   intensity_factor: 1.1,  // 已包含 difficulty 微调
//   estimated_duration_min: 240
// }
```

### 弱耦合联动（在行程优化中使用）

```typescript
// 计算最终疲劳值
function calculateFinalFatigue(
  fatigue: PhysicalMetadata,
  difficulty?: TrailDifficultyMetadata
): number {
  let final = fatigue.base_fatigue_score
    * (fatigue.intensity_factor || 1.0)
    * terrainMultiplier(fatigue.terrain_type);
  
  // Difficulty 只做微调（如果还没有在 intensity_factor 中应用）
  if (difficulty) {
    const modifier = DIFFICULTY_FATIGUE_MODIFIER[difficulty.level];
    final = final * modifier;
  }
  
  return final;
}
```

## 🚀 下一步

### 阶段 1: 数据迁移（待实现）

- 为现有 Place 记录生成独立的 `difficultyMetadata`
- 重新计算 `physicalMetadata`（移除 difficulty 污染）

### 阶段 2: 产品集成（待实现）

- 在 UI 中分别展示 Difficulty 和 Fatigue
- 实现个性化推荐（基于用户经验调整 difficulty 权重）

### 阶段 3: 数据收集（待实现）

- 收集用户反馈："是否比预期累 / 难"
- 分别回流到两个轨道，持续优化

## 📚 相关文档

- [`docs/DIFFICULTY-VS-FATIGUE-ARCHITECTURE.md`](./DIFFICULTY-VS-FATIGUE-ARCHITECTURE.md) - 架构设计说明
- [`docs/PHYSICAL-METADATA-REQUIRED-FIELDS.md`](./PHYSICAL-METADATA-REQUIRED-FIELDS.md) - 字段说明
- [`docs/PHYSICAL-METADATA-IMPROVEMENTS.md`](./PHYSICAL-METADATA-IMPROVEMENTS.md) - 改进说明
