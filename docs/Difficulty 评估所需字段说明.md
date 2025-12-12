# Difficulty 评估所需字段说明

## 📋 概述

本文档说明评估 `TrailDifficulty`（徒步难度）需要提供哪些字段数据，以及这些字段的格式、优先级和来源。

## ⚠️ 核心原则

### ✅ 允许进入 Difficulty 的信号

- **技术动作**：scramble, rope, exposure
- **地形不可逆**：cliff, ice, loose_rock
- **季节风险**：winter_ice, rain_loose, snow
- **官方/专业平台评级**：AllTrails, Komoot
- **社区风险关键词**：从游记中提取

### ❌ 禁止进入 Difficulty 的信号

- **距离**（km）
- **时长**（小时）
- **累计爬升**（m）
- **体力消耗**（fatigue score）
- **平均坡度**

这些属于 **Fatigue Track**，不是 Difficulty。

---

## 🎯 必需字段（按优先级排序）

### 优先级 1: 官方/专业平台评级 ⭐⭐⭐⭐⭐

**字段**: `trailDifficulty`  
**类型**: `string`  
**必需**: ❌ 否（但强烈推荐）  
**优先级**: 最高（最可靠）  
**说明**: 来自 AllTrails、Komoot、官方评级等专业平台

**可选值**:
- `"EASY"` / `"easy"` / `"1"` / `"⭐"`
- `"MODERATE"` / `"moderate"` / `"2"` / `"⭐⭐"`
- `"HARD"` / `"hard"` / `"3"` / `"⭐⭐⭐"`
- `"EXTREME"` / `"extreme"` / `"4"` / `"5"` / `"⭐⭐⭐⭐"` / `"⭐⭐⭐⭐⭐"`

**示例**:
```typescript
{
  metadata: {
    trailDifficulty: "HARD",
    source: "alltrails"  // 可选：数据来源
  }
}
```

**数据来源**:
- AllTrails API
- Komoot API
- 官方旅游网站
- 国家公园官网

**置信度**: 0.9（最高）

---

### 优先级 2: 技术等级 ⭐⭐⭐⭐

**字段**: `technicalGrade`  
**类型**: `number`  
**必需**: ❌ 否  
**优先级**: 高  
**说明**: 技术等级（1-5，5 为最高技术要求）

**取值范围**: `1` - `5`

**映射规则**:
- `1` → EASY
- `2` → MODERATE
- `3` → HARD
- `4-5` → EXTREME

**示例**:
```typescript
{
  metadata: {
    technicalGrade: 4,
    source: "komoot"
  }
}
```

**数据来源**:
- Komoot（技术等级）
- 专业向导评估
- 官方技术评级

**置信度**: 0.8

---

### 优先级 3: 风险因素 ⭐⭐⭐

**字段**: `riskFactors`  
**类型**: `string[]`  
**必需**: ❌ 否  
**优先级**: 中  
**说明**: 风险因素列表（只允许：技术动作、地形不可逆、季节风险）

**允许的值**（RiskFactor 类型）:

#### 技术动作
- `"scramble"` - 攀爬
- `"rope"` - 需要绳索
- `"exposure"` - 暴露感（悬崖）
- `"technical"` - 技术路段

#### 地形不可逆
- `"cliff"` - 陡崖
- `"ice"` - 冰雪
- `"loose_rock"` - 碎石
- `"unstable"` - 不稳定地形

#### 季节风险
- `"winter_ice"` - 冬季结冰
- `"rain_loose"` - 雨季碎石松动
- `"snow"` - 雪
- `"melt_water"` - 融水

**示例**:
```typescript
{
  metadata: {
    riskFactors: ["exposure", "rope", "ice"]
  }
}
```

**数据来源**:
- 游记 NLP 提取
- 用户标注
- 官方安全提示
- GPS 轨迹分析（地形）

**置信度**: 0.7

---

### 优先级 4: 风险因素标志字段（简化版）⭐⭐⭐

如果无法提供 `riskFactors` 数组，可以使用以下布尔字段：

**字段列表**:
- `requiresRope` / `rope` - 需要绳索
- `exposure` / `exposed` - 暴露感
- `scramble` / `technical` - 攀爬/技术路段
- `cliff` / `steep` - 陡崖/陡坡
- `ice` / `icy` - 冰雪
- `looseRock` / `unstable` - 碎石/不稳定
- `winterIce` / `snow` - 冬季结冰/雪
- `rainLoose` / `meltWater` - 雨季碎石/融水

**示例**:
```typescript
{
  metadata: {
    requiresRope: true,
    exposure: true,
    ice: true
  }
}
```

**自动转换**: 系统会自动将这些布尔字段转换为 `riskFactors` 数组

---

### 优先级 5: 子类别推断 ⭐⭐

**字段**: `subCategory`  
**类型**: `string`  
**必需**: ❌ 否  
**优先级**: 低（置信度最低）  
**说明**: 根据子类别推断难度

**高难度类别**（推断为 EXTREME）:
- `"volcano"` - 火山
- `"glacier"` - 冰川
- `"climbing"` - 攀爬

**中等难度类别**（推断为 HARD）:
- `"canyon"` - 峡谷
- `"waterfall"` - 瀑布
- `"cave"` - 洞穴

**示例**:
```typescript
{
  metadata: {
    subCategory: "glacier"
  }
}
```

**数据来源**:
- 自然 POI 分类
- OpenStreetMap tags
- 用户标注

**置信度**: 0.3-0.5（较低）

---

## 🔧 可选增强字段

### 装备要求

**字段**: `requiresEquipment`  
**类型**: `boolean`  
**说明**: 是否需要专业装备

**字段**: `requiresGuide`  
**类型**: `boolean`  
**说明**: 是否需要向导

**示例**:
```typescript
{
  metadata: {
    requiresEquipment: true,
    requiresGuide: true
  }
}
```

---

### 数据来源标识

**字段**: `source`  
**类型**: `string`  
**说明**: 数据来源标识

**可选值**:
- `"alltrails"`
- `"komoot"`
- `"official"`
- `"community"`
- `"manual"`

**示例**:
```typescript
{
  metadata: {
    trailDifficulty: "HARD",
    source: "alltrails"
  }
}
```

---

## 🌍 运行时字段（Persona & Season）

### 用户经验等级

**字段**: `userExperience`（在 `assess()` 方法的 `options` 参数中）  
**类型**: `'beginner' | 'intermediate' | 'advanced' | 'expert'`  
**说明**: 用户经验等级，用于 Persona 修正

**修正规则**:
- `beginner`: +1 星（更保守）
- `intermediate`: 0（不变）
- `advanced`: -0.5 星
- `expert`: -1 星

**示例**:
```typescript
const difficulty = TrailDifficultyAssessor.assess(metadata, {
  userExperience: 'beginner'
});
```

---

### 季节

**字段**: `season`（在 `assess()` 方法的 `options` 参数中）  
**类型**: `'winter' | 'spring' | 'summer' | 'autumn'`  
**说明**: 当前季节，用于季节修正

**修正规则**:
- `winter` + 有 `winter_ice` 或 `snow` 风险 → +1 星
- `spring` + 有 `rain_loose` 或 `melt_water` 风险 → +1 星

**示例**:
```typescript
const difficulty = TrailDifficultyAssessor.assess(metadata, {
  season: 'winter'
});
```

---

## 📊 完整示例

### 示例 1: 完整数据（最佳）

```typescript
{
  metadata: {
    // 优先级1：官方评级
    trailDifficulty: "HARD",
    source: "alltrails",
    
    // 优先级2：技术等级
    technicalGrade: 4,
    
    // 优先级3：风险因素
    riskFactors: ["exposure", "rope", "ice"],
    
    // 装备要求
    requiresEquipment: true,
    requiresGuide: true,
    
    // 子类别
    subCategory: "glacier"
  }
}

// 评估结果：
// {
//   level: 'EXTREME',
//   technicalGrade: 4,
//   riskFactors: ['exposure', 'rope', 'ice'],
//   requiresEquipment: true,
//   requiresGuide: true,
//   source: 'alltrails',
//   confidence: 0.9,
//   explanations: [
//     '⭐⭐⭐⭐ 需要技术/经验，错误可能受伤',
//     '风险因素：暴露感强（悬崖路段）、需要绳索、冰雪',
//     '需要专业装备',
//     '建议向导陪同',
//   ],
// }
```

### 示例 2: 只有风险因素标志

```typescript
{
  metadata: {
    // 使用布尔字段（系统会自动转换）
    requiresRope: true,
    exposure: true,
    ice: true,
    winterIce: true
  }
}

// 评估结果：
// {
//   level: 'EXTREME',  // 高风险信号触发
//   riskFactors: ['rope', 'exposure', 'ice', 'winter_ice'],
//   requiresEquipment: true,
//   requiresGuide: true,
//   source: 'risk_trigger',
//   confidence: 0.8,
//   explanations: [
//     '检测到 4 个高风险信号：rope、exposure、ice、winter_ice',
//     '存在技术门槛或不可逆地形风险',
//   ],
// }
```

### 示例 3: 只有子类别（置信度最低）

```typescript
{
  metadata: {
    subCategory: "volcano"
  }
}

// 评估结果：
// {
//   level: 'EXTREME',
//   source: 'subcategory',
//   confidence: 0.5,  // 置信度较低
//   requiresEquipment: true,
//   riskFactors: ['exposure', 'technical'],
//   explanations: [
//     '子类别：volcano',
//     '火山/冰川/攀爬类活动通常需要专业装备和向导',
//   ],
// }
```

### 示例 4: 带 Persona 和 Season 修正

```typescript
const metadata = {
  trailDifficulty: "HARD",
  riskFactors: ["ice", "exposure"]
};

const difficulty = TrailDifficultyAssessor.assess(metadata, {
  userExperience: 'beginner',  // 新手
  season: 'winter'              // 冬季
});

// 评估结果：
// {
//   level: 'EXTREME',  // HARD + 新手(+1) + 冬季(+1) = EXTREME
//   riskFactors: ['ice', 'exposure'],
//   seasonalModifier: {
//     season: 'winter',
//     modifier: +1,
//     reason: '冬季结冰，失足风险高',
//   },
//   explanations: [
//     '⭐⭐⭐⭐ 需要技术/经验，错误可能受伤',
//     '风险因素：冰雪、暴露感强（悬崖路段）',
//     '需要专业装备',
//     '季节修正：冬季结冰，失足风险高',
//     '新手用户：难度提升 1 星（更保守）',
//   ],
// }
```

---

## 📝 最小化数据要求

### 场景 1: 只有官方评级（推荐）

**提供**: `trailDifficulty`  
**结果**: 高置信度评估（0.9）

### 场景 2: 只有风险因素

**提供**: `riskFactors` 或风险因素布尔字段  
**结果**: 中等置信度评估（0.7-0.8），但能触发高风险警告

### 场景 3: 只有子类别

**提供**: `subCategory`  
**结果**: 低置信度评估（0.3-0.5），仅作参考

---

## 🚨 重要提醒

### 1. 禁止使用距离/时长

```typescript
// ❌ 错误
{
  metadata: {
    distance: 20,      // 禁止！
    duration: 8,       // 禁止！
    elevationGain: 500 // 禁止！
  }
}

// ✅ 正确
{
  metadata: {
    riskFactors: ["exposure", "rope"],  // 只关注风险
    technicalGrade: 4
  }
}
```

### 2. 高风险信号必须提供

如果路线存在高风险，**必须**提供以下至少一项：
- `riskFactors` 包含高风险因素
- `requiresRope: true`
- `exposure: true`
- `ice: true`

否则系统无法触发高风险警告，可能导致安全隐患。

### 3. 季节风险需要明确标识

如果路线在特定季节有风险，**必须**提供：
- `winterIce: true`（冬季）
- `rainLoose: true`（雨季）
- `snow: true`（雪季）

---

## 🔍 数据来源建议

### 优先级 1: 官方/专业平台

- **AllTrails API**: `difficulty` 字段
- **Komoot API**: `technical_grade` 字段
- **国家公园官网**: 官方安全评级

### 优先级 2: 社区数据

- **游记 NLP**: 提取风险关键词
  - "需要绳索" → `rope: true`
  - "暴露感强" → `exposure: true`
  - "冬季结冰" → `winterIce: true`

### 优先级 3: GPS 轨迹分析

- **地形分析**: 从 GPS 轨迹推断地形类型
- **坡度分析**: 识别陡崖、碎石路段

### 优先级 4: 用户标注

- 允许用户手动标注风险因素
- 收集用户反馈："是否比预期难"

---

## 📚 相关文档

- [`docs/DIFFICULTY-SAFETY-FIRST-DESIGN.md`](./DIFFICULTY-SAFETY-FIRST-DESIGN.md) - 设计原则
- [`docs/DIFFICULTY-VS-FATIGUE-ARCHITECTURE.md`](./DIFFICULTY-VS-FATIGUE-ARCHITECTURE.md) - 分轨道架构
- [`src/places/interfaces/trail-difficulty.interface.ts`](../src/places/interfaces/trail-difficulty.interface.ts) - 接口定义
- [`src/places/utils/trail-difficulty-assessor.util.ts`](../src/places/utils/trail-difficulty-assessor.util.ts) - 评估器实现
