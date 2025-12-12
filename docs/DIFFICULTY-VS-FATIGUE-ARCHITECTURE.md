# 为什么必须"分轨道"解决 Difficulty 和 Fatigue

## 🎯 核心问题：两种不同的评估维度

在户外与自然 POI 场景中，`trailDifficulty`（难度）和 `physical fatigue`（体力消耗）表面上相关，底层却是**两种不同问题**：

### **难度（Difficulty）**回答的是：

> 「这条路线对一个**有经验但非专业**的人来说，有多挑战？」

- **问题类型**: 分类问题（离散）
- **核心关注**: 技术性、风险、门槛
- **语义**: "是否适合去"、"能不能上"
- **输出**: 1-5 星（或 EASY/MODERATE/HARD/EXTREME）

### **疲劳（Fatigue）**回答的是：

> 「一个具体的人，在具体条件下，会有多累？」

- **问题类型**: 连续预测问题
- **核心关注**: 时长、强度、恢复条件
- **语义**: "能不能撑住"、"需要多少体力"
- **输出**: 连续值（1-10 分，或 kcal，或 fatigue score）

---

## ⚠️ 混在一起的危害

如果你把二者混在一起：

### 问题 1: Difficulty 会被"8 小时缓坡"污染

```
场景：8 小时缓坡徒步
- 距离：20km
- 爬升：500m（缓坡）
- 技术难度：低（无技术路段）

❌ 错误做法：
  difficulty = HARD（因为"8小时"很长）
  → 用户看到"困难"就不敢去了
  → 但实际上技术难度很低，只是时间长

✅ 正确做法：
  difficulty = EASY（技术难度低）
  fatigue = 8（因为时间长、距离远）
  → 用户知道"不难但累"，可以合理安排
```

### 问题 2: Fatigue 会被"短而险的技术路线"夸大

```
场景：2 小时技术攀爬
- 距离：3km
- 爬升：800m（陡峭）
- 技术难度：高（需要绳索、暴露感强）

❌ 错误做法：
  fatigue = 9（因为 difficulty = HARD）
  → 行程规划认为"很累"，安排大量休息
  → 但实际上体力消耗不大，只是技术门槛高

✅ 正确做法：
  difficulty = HARD（技术门槛高）
  fatigue = 5（因为时间短、距离短）
  → 用户知道"难但不累"，可以连续安排
```

---

## ✅ 正确做法：双轨建模、弱耦合联动

### 架构原则

```
难度 = 门槛 & 风险（偏离散）
疲劳 = 消耗 & 时间（偏连续）

二者在最后"汇合"，而不是互相决定
```

### 联动规则

**Difficulty 是 Fatigue 的"调制器"，不是输入源**

```
final_fatigue = 
  base_fatigue
  × terrain_multiplier
  × altitude_multiplier
  × difficulty_modifier  ← 只做微调（5-15%），不可翻倍
```

**示例**:
- ⭐⭐⭐⭐⭐：fatigue × 1.15（心理压力 / 技术消耗）
- ⭐⭐⭐：fatigue × 1.05
- ⭐⭐：fatigue × 0.95

**但**:
- ❌ difficulty 不能决定 fatigue 的主量级
- ✅ 只能微调，不可翻倍

---

## 🏗️ 推荐的整体架构

### 🟠 Track A：Trail Difficulty（是否"难"）

**目标**: 给用户一个"能不能上"的判断  
**输出**: 1-5 星（离散）

**核心信号**（偏结构化 & 多源一致）:
- 路线类型：徒步 / 攀爬 / 冰川 / 涉水
- 技术要求：是否 scramble / rope / exposure
- 地形复杂度：岩石、碎石、冰雪
- 官方/专业平台 difficulty（AllTrails / Komoot）
- 社区一致性（负面关键词密度）

**👉 重要**:
- ❌ 不直接用"距离""时间"
- ❌ 不因"久"而变"难"

### 🟢 Track B：Physical Fatigue（有多累）

**目标**: 帮助行程规划、节奏控制  
**输出**: 连续值（1-10 或 kcal / fatigue score）

**核心信号**（物理可解释）:
- 距离（km）
- 累计爬升（m）
- 平均 / 最大坡度
- 预计时长
- 海拔修正
- seated_ratio / 交通方式

**👉 重要**:
- ✅ 可以很累但不难（8h 缓坡）
- ✅ 也可以很难但不累（2h 技术路线）

---

## 📊 数据来源"各司其职"

| 来源 | 用于 Difficulty | 用于 Fatigue |
|------|----------------|--------------|
| AllTrails | ✅（difficulty、reviews） | ⚠️（时长偏差） |
| Komoot | ✅（technical grade） | ✅（distance, climb） |
| 政府官网 | ✅（安全等级） | ❌ |
| GPS 轨迹 | ❌ | ✅（真实爬升/坡度） |
| 游记 NLP | ✅（风险/难度） | ⚠️ |

---

## 📋 问题分析表格

| 模块 | 内容 |
|------|------|
| **变量分解（H / E）** | H（人）：体能、经验、恐高、负重；E（环境）：坡度、距离、技术路段、海拔、天气 |
| **研究问题** | 1) 难度与疲劳的相关度上限是多少？<br>2) 哪些信号只该进 Difficulty？<br>3) Difficulty 参与 Fatigue 的最佳权重是多少？ |

---

## 🎯 四种可选策略方法（落地路径）

### 策略一：双模型 + 最小耦合（最推荐）⭐

**实现**:
- 先独立跑 Difficulty 和 Fatigue，两套规则/模型完全分离
- 只在最后一步用 difficulty 做 5-15% 的疲劳修正

**优点**: 可解释、好调参、不会互相拖垮

### 策略二：Difficulty 作为"阈值门禁"

**实现**:
- ⭐⭐⭐⭐⭐：不推荐给低体能用户
- ⭐⭐⭐⭐：需要提醒
- Fatigue 只负责算"有多累"

**优点**: 产品语义清晰

### 策略三：用户感知分层

**实现**:
- 对新手用户放大 difficulty 权重
- 对老玩家弱化

**优点**: 个性化  
**风险**: 复杂度上升

### 策略四：真实反馈校正

**实现**:
- 收集"是否比预期累 / 难"
- 分别回流到两个轨道

**优点**: 长期最准

---

## 📝 案例对照（验证设计）

| 场景 | Difficulty | Fatigue | 解释 |
|------|-----------|---------|------|
| 冰川短线 | ⭐⭐⭐⭐⭐ | 6 | 技术高、时间短 |
| 8h 缓坡 | ⭐⭐ | 8 | 累但不难 |
| 火山观景 | ⭐⭐⭐⭐ | 4 | 心理与地形 |
| 城市爬楼 | ⭐ | 7 | 累但无门槛 |

---

## 🔧 实现建议

### 1. 分离数据结构

```typescript
// Difficulty Track（独立）
interface TrailDifficultyMetadata {
  level: 'EASY' | 'MODERATE' | 'HARD' | 'EXTREME';
  technicalGrade: number;  // 1-5
  riskFactors: string[];   // ['exposure', 'rope', 'scramble']
  requiresEquipment: boolean;
  source: 'alltrails' | 'komoot' | 'official' | 'community';
}

// Fatigue Track（独立）
interface PhysicalMetadata {
  base_fatigue_score: number;
  terrain_type: 'FLAT' | 'HILLY' | 'STAIRS_ONLY';
  seated_ratio: number;
  intensity_factor: number;
  estimated_duration_min: number;
  // ... 不包含 difficulty 的直接映射
}
```

### 2. 弱耦合联动

```typescript
function calculateFinalFatigue(
  baseFatigue: PhysicalMetadata,
  difficulty: TrailDifficultyMetadata
): number {
  // 基础疲劳（完全独立计算）
  let fatigue = baseFatigue.base_fatigue_score
    * baseFatigue.intensity_factor
    * terrainMultiplier(baseFatigue.terrain_type)
    * altitudeMultiplier(baseFatigue.elevationMeters);
  
  // Difficulty 只做微调（5-15%）
  const difficultyModifier = {
    'EASY': 0.95,
    'MODERATE': 1.0,
    'HARD': 1.1,
    'EXTREME': 1.15,
  };
  
  fatigue = fatigue * difficultyModifier[difficulty.level];
  
  return fatigue;
}
```

### 3. 数据来源分离

```typescript
// Difficulty 评估器（独立）
class DifficultyAssessor {
  static assess(
    technicalGrade?: number,
    riskFactors?: string[],
    officialRating?: string,
    communityReviews?: string[]
  ): TrailDifficultyMetadata {
    // 只关注技术性、风险、门槛
    // 不考虑距离、时间
  }
}

// Fatigue 评估器（独立）
class FatigueAssessor {
  static assess(
    distance: number,
    elevationGain: number,
    duration: number,
    terrain: string,
    altitude: number
  ): PhysicalMetadata {
    // 只关注物理消耗
    // 不考虑技术难度
  }
}
```

---

## 🚀 迁移路径

### 阶段 1: 识别问题（当前状态）

- ✅ 识别出 `trailDifficulty` 直接决定 `fatigue` 的问题
- ✅ 理解两种评估维度的差异

### 阶段 2: 分离数据结构

- 创建 `TrailDifficultyMetadata` 接口
- 从 `PhysicalMetadata` 中移除 `trailDifficulty` 的直接映射
- 保持向后兼容（过渡期）

### 阶段 3: 实现独立评估器

- 实现 `DifficultyAssessor`
- 重构 `PhysicalMetadataGenerator`，移除 difficulty 的直接决定作用
- 实现弱耦合联动机制

### 阶段 4: 数据迁移

- 为现有 Place 记录生成独立的 `difficultyMetadata`
- 重新计算 `physicalMetadata`（移除 difficulty 污染）

### 阶段 5: 产品集成

- 在 UI 中分别展示 Difficulty 和 Fatigue
- 实现个性化推荐（基于用户经验调整 difficulty 权重）

---

## 📚 相关文档

- [`docs/PHYSICAL-METADATA-REQUIRED-FIELDS.md`](./PHYSICAL-METADATA-REQUIRED-FIELDS.md) - 字段说明
- [`docs/PHYSICAL-METADATA-IMPROVEMENTS.md`](./PHYSICAL-METADATA-IMPROVEMENTS.md) - 改进说明
- [`docs/PLACE-CATEGORY-GUIDE.md`](./PLACE-CATEGORY-GUIDE.md) - Category 获取指南
