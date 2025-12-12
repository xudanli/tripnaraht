# Difficulty 系统：安全优先、风险透明、可解释设计

## 🎯 核心立场

这是一个**"安全优先、风险透明、可解释、允许保守偏差"**的难度系统。

## 📋 五大设计原则

### 1️⃣ 「可能危险」优先提醒

**核心理解**：
- Difficulty = 风险与门槛信号，**不是"累不累"的同义词**
- ⭐⭐⭐⭐⭐ 是一种**强警告**
- 错判代价极高
- **宁可保守，不可乐观**

**产品行为**：
- ⭐⭐⭐⭐⭐：默认不推荐给新手
- 强提示：「存在高风险路段」
- 必须展示"为什么"

### 2️⃣ 同一路线，对新手 ⭐⭐⭐⭐⭐，对老手 ⭐⭐ 是真实存在的

**核心理解**：
- Difficulty 不是客观常数，而是**"人 × 路线"的关系**
- 必须允许 Difficulty 有"上下文版本"，否则一定误伤

**产品行为**：
- Difficulty 必须支持 **Persona 修正**
- `effectiveDifficulty = baseDifficulty + experienceModifier`
- 示例：新手 +1 星，有技术经验 -1 星

### 3️⃣ Difficulty 会随季节变化

**核心理解**：
- Difficulty 不能只从 POI 静态 metadata 推断
- 它是：**路线 × 时间 × 条件** 的函数

**产品行为**：
- 至少需要一个 **Seasonal Risk Overlay**
- 条件修正：
  - 冬季结冰：+1 星
  - 雨季碎石松动：+1 星
  - 干燥稳定：0

### 4️⃣ "把难说得简单"是最危险的错误

**核心理解**：
- 系统**必须偏向 false positive（多报风险）**
- 而不是 false negative

**产品行为**：
- ⭐⭐⭐⭐⭐ 的触发条件：**允许冗余，不允许遗漏**
- 任何一个「高风险信号」+「不确定性高」 → 提升 1 星

### 5️⃣ 愿意解释"为什么是 ⭐⭐⭐⭐⭐"

**核心理解**：
- 追求的是**可解释的信任系统**，不是黑箱评分

**产品行为**：
- 每个 ⭐⭐⭐⭐⭐ 至少有 2-3 条解释因子
- 例如：
  - 暴露感强（悬崖路段）
  - 冬季结冰，失足风险高
  - 社区多次报告需技术装备

---

## 🎯 Difficulty 的最终定义

**Trail Difficulty（⭐⭐⭐⭐⭐）不是体力消耗，而是：**

> 「在当前条件下，一个**目标人群**是否可能遭遇**超出预期的风险或技术门槛**」

### 公式

```
Difficulty = 风险 × 技术 × 不可逆性
```

### 不是

- ❌ 时间
- ❌ 累不累
- ❌ 走多久

---

## 📊 Difficulty 模型（明确版）

### ① 核心输入（只允许这些进入 Difficulty）

| 维度 | 是否允许 | 说明 |
|------|---------|------|
| **技术动作**（scramble / rope / exposure） | ✅ | 核心 |
| **地形不可逆**（陡崖 / 冰雪 / 碎石） | ✅ | 核心 |
| **季节风险**（雪 / 冰 / 融水） | ✅ | 核心 |
| **官方/专业平台难度** | ✅ | 参考 |
| **社区风险关键词** | ✅ | 校正 |
| **距离 / 时长** | ❌ | **禁止** |
| **累计爬升** | ❌ | **禁止** |

👉 **这是一个非常重要的"排除表"**  
它会让你的系统和 80% 的"伪难度"产品拉开差距。

### ② Difficulty 星级的真实语义（系统内部定义）

| 星级 | 含义（给系统用） |
|------|----------------|
| ⭐ | 几乎无风险，新手可随时撤退 |
| ⭐⭐ | 有地形变化，但直觉可应对 |
| ⭐⭐⭐ | 需要经验判断，错误会不舒服 |
| ⭐⭐⭐⭐ | 需要技术/经验，错误可能受伤 |
| ⭐⭐⭐⭐⭐ | 错误可能导致严重后果（fall / lost / exposure） |

⚠️ **注意**：

⭐⭐⭐⭐⭐ 不是"很累"，而是：

> 「你一旦判断错，很难靠体力补救」

---

## 🔧 实现策略

### 策略一：风险门禁模型（最推荐）⭐

**实现**：
- ⭐⭐⭐⭐⭐ 不是算出来的，而是**被触发的**
- 任一高风险 + 无明显缓冲 → ⭐⭐⭐⭐⭐

**优点**：安全、清晰、好解释

**代码示例**：
```typescript
// 高风险信号触发检查
if (hasHighRisk && !metadata.trailDifficulty && riskFactors.length >= 2) {
  return {
    level: DIFFICULTY_LEVEL.EXTREME,  // 保守：直接提升到最高
    riskFactors,
    requiresEquipment: true,
    explanations: [
      `检测到 ${riskFactors.length} 个高风险信号：${riskFactors.join('、')}`,
      '存在技术门槛或不可逆地形风险',
    ],
  };
}
```

### 策略二：Persona 分层 Difficulty

**实现**：
- 同一路线存 `baseDifficulty`
- 但展示的是 `effectiveDifficulty`

**优点**：真实、不欺骗新手

**代码示例**：
```typescript
// 用户经验修正
const experienceModifier = {
  beginner: +1,      // 新手：+1 星（更保守）
  intermediate: 0,   // 中级：不变
  advanced: -0.5,    // 高级：-0.5 星
  expert: -1,        // 专家：-1 星
};

effectiveDifficulty = baseDifficulty + experienceModifier[userExperience];
```

### 策略三：季节 Overlay

**实现**：
- 不改 POI 本体，只在运行时叠加

**优点**：避免数据污染

**代码示例**：
```typescript
// 季节修正
if (season === 'winter' && hasIceRisk) {
  seasonalModifier = {
    season: 'winter',
    modifier: +1,  // 冬季结冰：+1 星
    reason: '冬季结冰，失足风险高',
  };
}
```

### 策略四：解释优先设计

**实现**：
- 先写"解释模板"，再写规则

**优点**：防止黑箱

**代码示例**：
```typescript
// 生成解释因子
explanations = [
  `${semantics.stars} ${semantics.meaning}`,
  `风险因素：${riskDescriptions}`,
  requiresEquipment ? '需要专业装备' : '',
  requiresGuide ? '建议向导陪同' : '',
  seasonalModifier ? `季节修正：${seasonalModifier.reason}` : '',
];
```

---

## 📝 产品行为映射

### 1️⃣ 「可能危险」→ UI & 逻辑行为

**⭐⭐⭐⭐⭐ 的处理**：

```typescript
if (difficulty.level === 'EXTREME') {
  // 默认不推荐给新手
  if (userExperience === 'beginner') {
    return {
      recommended: false,
      warning: '存在高风险路段',
      explanations: difficulty.explanations,
    };
  }
  
  // 强提示
  return {
    recommended: true,
    warning: '⚠️ 高风险：存在技术门槛或不可逆地形风险',
    explanations: difficulty.explanations,
    requiresEquipment: true,
    requiresGuide: difficulty.requiresGuide,
  };
}
```

### 2️⃣ 「同一路线，不同人不同星」

**Persona 修正**：

```typescript
const baseDifficulty = assessBase(metadata);
const effectiveDifficulty = applyExperienceModifier(
  baseDifficulty,
  userExperience
);

// 展示给用户
displayDifficulty(effectiveDifficulty, {
  showBase: true,  // 显示基础难度
  showEffective: true,  // 显示有效难度
  showReason: true,  // 显示修正原因
});
```

### 3️⃣ 「季节变化」

**Seasonal Overlay**：

```typescript
const baseDifficulty = assessBase(metadata);
const seasonalModifier = getSeasonalModifier(baseDifficulty, currentSeason);

if (seasonalModifier) {
  const adjustedDifficulty = applyModifier(baseDifficulty, seasonalModifier);
  
  // 展示
  displayDifficulty(adjustedDifficulty, {
    showSeasonalWarning: true,
    seasonalReason: seasonalModifier.reason,
  });
}
```

### 4️⃣ 「宁可保守」

**False Positive 偏向**：

```typescript
// 高风险信号触发（允许冗余，不允许遗漏）
if (hasHighRisk && uncertaintyHigh) {
  // 直接提升到最高
  level = DIFFICULTY_LEVEL.EXTREME;
  explanations.push('检测到高风险信号，保守评估');
}
```

### 5️⃣ 「愿意解释」

**解释因子生成**：

```typescript
const explanations = generateExplanations(difficulty);
// [
//   '⭐⭐⭐⭐ 需要技术/经验，错误可能受伤',
//   '风险因素：暴露感强（悬崖路段）、需要绳索',
//   '需要专业装备',
//   '建议向导陪同',
//   '季节修正：冬季结冰，失足风险高',
// ]
```

---

## 🚨 禁止进入 Difficulty 的信号

### ❌ 禁止列表

- **距离**（km）
- **时长**（小时）
- **累计爬升**（m）
- **体力消耗**（fatigue score）
- **平均坡度**（这些属于 Fatigue Track）

### ✅ 允许列表

- **技术动作**：scramble, rope, exposure
- **地形不可逆**：cliff, ice, loose_rock
- **季节风险**：winter_ice, rain_loose, snow
- **官方评级**：AllTrails, Komoot
- **社区风险关键词**：从游记中提取

---

## 📊 案例对照

| 场景 | Difficulty | Fatigue | 解释 |
|------|-----------|---------|------|
| 冰川短线 | ⭐⭐⭐⭐⭐ | 6 | 技术高、时间短 |
| 8h 缓坡 | ⭐⭐ | 8 | 累但不难 |
| 火山观景 | ⭐⭐⭐⭐ | 4 | 心理与地形 |
| 城市爬楼 | ⭐ | 7 | 累但无门槛 |
| 冬季结冰路线 | ⭐⭐⭐⭐⭐ | 5 | 季节风险提升难度 |

---

## 🔍 问题分析表格

| 模块 | 内容 |
|------|------|
| **变量分解（H / E）** | H（人）：经验、技术、心理承受；E（环境）：暴露、不可逆地形、季节风险 |
| **研究问题** | 1) 什么条件下必须上调到 ⭐⭐⭐⭐⭐？<br>2) 哪些变量严禁进入 Difficulty？<br>3) 如何在保守与可信之间平衡？ |

---

## 🚀 使用示例

### 基础评估

```typescript
import { TrailDifficultyAssessor } from './utils/trail-difficulty-assessor.util';

const difficulty = TrailDifficultyAssessor.assess(place.metadata);
// {
//   level: 'EXTREME',
//   riskFactors: ['exposure', 'rope', 'ice'],
//   requiresEquipment: true,
//   requiresGuide: true,
//   explanations: [
//     '⭐⭐⭐⭐ 需要技术/经验，错误可能受伤',
//     '风险因素：暴露感强（悬崖路段）、需要绳索、冰雪',
//     '需要专业装备',
//     '建议向导陪同',
//   ],
// }
```

### 带 Persona 修正

```typescript
const difficulty = TrailDifficultyAssessor.assess(place.metadata, {
  userExperience: 'beginner',  // 新手
});
// {
//   level: 'EXTREME',  // 基础是 HARD，新手 +1 星
//   explanations: [
//     '...',
//     '新手用户：难度提升 1 星（更保守）',
//   ],
// }
```

### 带季节修正

```typescript
const difficulty = TrailDifficultyAssessor.assess(place.metadata, {
  season: 'winter',  // 冬季
});
// {
//   level: 'EXTREME',  // 基础是 HARD，冬季 +1 星
//   seasonalModifier: {
//     season: 'winter',
//     modifier: +1,
//     reason: '冬季结冰，失足风险高',
//   },
//   explanations: [
//     '...',
//     '季节修正：冬季结冰，失足风险高',
//   ],
// }
```

---

## 📚 相关文档

- [`docs/DIFFICULTY-VS-FATIGUE-ARCHITECTURE.md`](./DIFFICULTY-VS-FATIGUE-ARCHITECTURE.md) - 分轨道架构
- [`docs/DIFFICULTY-FATIGUE-REFACTOR-SUMMARY.md`](./DIFFICULTY-FATIGUE-REFACTOR-SUMMARY.md) - 重构总结
- [`src/places/interfaces/trail-difficulty.interface.ts`](../src/places/interfaces/trail-difficulty.interface.ts) - 接口定义
- [`src/places/utils/trail-difficulty-assessor.util.ts`](../src/places/utils/trail-difficulty-assessor.util.ts) - 评估器实现
