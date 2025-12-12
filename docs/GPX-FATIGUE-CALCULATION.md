# GPX 数据到 Fatigue 评估指南

## 📋 概述

本文档说明如何使用 GPX（GPS Exchange Format）数据来推算 **Fatigue**（体力消耗），**不是 Difficulty**。

⚠️ **重要区分**：
- **Difficulty** = 风险 × 技术 × 不可逆性（不包含距离/爬升）
- **Fatigue** = 距离 × 爬升 × 时长（物理消耗）

GPX 数据用于 **Fatigue Track**，不是 Difficulty Track。

---

## 🎯 数学模型

### 核心公式

**等效平路距离**：
$$S_{km} = D_{total} + \frac{E_{gain}}{100}$$

其中：
- $D_{total}$：总距离（公里）
- $E_{gain}$：累计爬升高度（米）
- 每 100 米爬升 ≈ 1 公里平路难度

### 增强修正

**1. 高海拔修正**：
$$S_{final} = S_{km} \times \begin{cases} 1.3 & \text{if } E_{max} \ge 2000\text{m} \\ 1.0 & \text{if } E_{max} < 2000\text{m} \end{cases}$$

**2. 陡坡修正**：
如果平均坡度 $Slope_{avg} \ge 15\%$，则：
$$S_{final} = S_{km} \times 1.5$$

**平均坡度计算**：
$$Slope_{avg} = \frac{E_{gain}}{D_{total} \times 1000} \times 100\%$$

---

## 📊 难度等级映射（Fatigue 强度）

| 强度等级 | 等效距离范围 | 描述 |
|---------|-------------|------|
| LOW | $S_{km} \le 8\text{ km}$ | 低强度：适合所有年龄和体力水平，路线平坦，时长短 |
| MODERATE | $8\text{ km} < S_{km} \le 18\text{ km}$ | 中等强度：需要一定体力，有坡度或中等长度 |
| HIGH | $18\text{ km} < S_{km} \le 30\text{ km}$ | 高强度：对体力有较高要求，涉及长距离、大爬升或陡峭地形 |
| EXTREME | $S_{km} > 30\text{ km}$ | 极高强度：仅限经验丰富的户外人士，通常是全天行程、高海拔、极端爬升 |

⚠️ **注意**：这是 **Fatigue 强度等级**，不是 Difficulty 难度等级。

---

## 🔧 使用示例

### 1. 解析 GPX 文件

```typescript
import { GPXParser } from './utils/gpx-parser.util';
import { GPXFatigueCalculator } from './utils/gpx-fatigue-calculator.util';

// 从文件解析
const points = await GPXParser.parseFromFile('./trail.gpx');

// 或从 URL 解析
const points = await GPXParser.parseFromURL('https://example.com/trail.gpx');

// 或从 XML 字符串解析
const gpxXml = `<?xml version="1.0"?>
<gpx>
  <trkpt lat="64.123" lon="-21.456">
    <ele>100</ele>
    <time>2024-01-01T10:00:00Z</time>
  </trkpt>
  <trkpt lat="64.124" lon="-21.457">
    <ele>150</ele>
    <time>2024-01-01T10:05:00Z</time>
  </trkpt>
</gpx>`;
const points = GPXParser.parse(gpxXml);
```

### 2. 分析 GPX 数据

```typescript
const analysis = GPXFatigueCalculator.analyzeGPX(points);

console.log(analysis);
// {
//   totalDistance: 12.5,        // 总距离（公里）
//   elevationGain: 800,        // 累计爬升（米）
//   elevationLoss: 750,        // 累计下降（米）
//   maxElevation: 2500,         // 最高海拔（米）
//   minElevation: 1700,         // 最低海拔（米）
//   averageSlope: 6.4,          // 平均坡度（%）
//   equivalentDistance: 20.5,   // 等效平路距离（公里）
//   fatigueScore: 26.65,        // 疲劳评分（已应用高海拔修正）
// }
```

### 3. 生成 Fatigue Metadata

```typescript
const fatigueMetadata = GPXFatigueCalculator.generateFatigueMetadata(analysis);

console.log(fatigueMetadata);
// {
//   base_fatigue_score: 7,
//   terrain_type: 'HILLY',
//   seated_ratio: 0,
//   intensity_factor: 2.5,
//   estimated_duration_min: 307,  // 约 5 小时
// }
```

### 4. 映射到强度等级

```typescript
const level = GPXFatigueCalculator.mapToFatigueLevel(analysis.equivalentDistance);

console.log(level);
// {
//   level: 'HIGH',
//   description: '高强度：对体力有较高要求，涉及长距离、大爬升或陡峭地形',
// }
```

---

## 📝 完整工作流

### 场景：从 GPX 文件生成完整的 PhysicalMetadata

```typescript
import { GPXParser } from './utils/gpx-parser.util';
import { GPXFatigueCalculator } from './utils/gpx-fatigue-calculator.util';
import { PhysicalMetadataGenerator } from './utils/physical-metadata-generator.util';
import { PlaceCategory } from '@prisma/client';

async function generateMetadataFromGPX(gpxFilePath: string) {
  // 1. 解析 GPX 文件
  const points = await GPXParser.parseFromFile(gpxFilePath);
  
  // 2. 分析 GPX 数据
  const analysis = GPXFatigueCalculator.analyzeGPX(points);
  
  // 3. 从 GPX 生成 Fatigue 元数据
  const gpxFatigue = GPXFatigueCalculator.generateFatigueMetadata(analysis);
  
  // 4. 准备 metadata（包含 GPX 分析结果）
  const metadata = {
    // GPX 分析结果
    gpxAnalysis: {
      totalDistance: analysis.totalDistance,
      elevationGain: analysis.elevationGain,
      maxElevation: analysis.maxElevation,
      averageSlope: analysis.averageSlope,
      equivalentDistance: analysis.equivalentDistance,
    },
    // 其他 metadata（如果有）
    // trailDifficulty: "HARD",  // 这是 Difficulty，不是 Fatigue
    // riskFactors: ["exposure"], // 这是 Difficulty，不是 Fatigue
  };
  
  // 5. 使用 PhysicalMetadataGenerator 生成完整的 metadata
  // （它会合并 GPX 数据和其他 metadata）
  const physicalMetadata = PhysicalMetadataGenerator.generateByCategory(
    PlaceCategory.ATTRACTION,
    metadata
  );
  
  // 6. 合并 GPX 生成的 Fatigue 数据（优先级更高）
  const finalMetadata: PhysicalMetadata = {
    ...physicalMetadata,
    ...gpxFatigue,  // GPX 数据覆盖默认值
  };
  
  return {
    physicalMetadata: finalMetadata,
    gpxAnalysis: analysis,
  };
}
```

---

## 🔍 GPX 数据提取的字段

### 从 GPX 可以提取的字段（用于 Fatigue）

| 字段 | 类型 | 说明 | 用途 |
|------|------|------|------|
| `totalDistance` | `number` (km) | 总距离 | Fatigue 计算 |
| `elevationGain` | `number` (m) | 累计爬升 | Fatigue 计算 |
| `elevationLoss` | `number` (m) | 累计下降 | Fatigue 计算 |
| `maxElevation` | `number` (m) | 最高海拔 | 高海拔修正 |
| `minElevation` | `number` (m) | 最低海拔 | 海拔范围 |
| `averageSlope` | `number` (%) | 平均坡度 | 陡坡修正、地形推断 |
| `equivalentDistance` | `number` (km) | 等效平路距离 | Fatigue 强度等级 |

### ⚠️ GPX 无法提取的字段（需要其他数据源）

| 字段 | 说明 | 数据来源 |
|------|------|----------|
| `trailDifficulty` | Difficulty 难度等级 | AllTrails, Komoot, 官方评级 |
| `riskFactors` | 风险因素 | 游记 NLP, 用户标注 |
| `technicalGrade` | 技术等级 | Komoot, 专业评估 |
| `requiresRope` | 需要绳索 | 游记, 官方提示 |
| `exposure` | 暴露感 | 游记 NLP, GPS 地形分析 |

---

## 🚨 重要提醒

### 1. GPX 数据用于 Fatigue，不是 Difficulty

```typescript
// ❌ 错误：不要用 GPX 数据评估 Difficulty
const difficulty = assessDifficulty({
  distance: analysis.totalDistance,  // 禁止！
  elevationGain: analysis.elevationGain,  // 禁止！
});

// ✅ 正确：用 GPX 数据评估 Fatigue
const fatigue = generateFatigueMetadata(analysis);
```

### 2. Difficulty 需要其他数据源

```typescript
// Difficulty 需要这些字段（不是 GPX）
const difficulty = TrailDifficultyAssessor.assess({
  trailDifficulty: "HARD",  // 来自 AllTrails
  riskFactors: ["exposure", "rope"],  // 来自游记 NLP
  technicalGrade: 4,  // 来自 Komoot
});
```

### 3. 完整评估需要两个轨道

```typescript
// Track A: Difficulty（风险 × 技术 × 不可逆性）
const difficulty = TrailDifficultyAssessor.assess(metadata, {
  userExperience: 'beginner',
  season: 'winter',
});

// Track B: Fatigue（距离 × 爬升 × 时长）
const fatigue = PhysicalMetadataGenerator.generateByCategory(
  category,
  { ...metadata, gpxAnalysis: analysis }
);

// 弱耦合联动
const finalFatigue = applyDifficultyModifier(fatigue, difficulty);
```

---

## 📚 相关文档

- [`docs/DIFFICULTY-REQUIRED-FIELDS.md`](./DIFFICULTY-REQUIRED-FIELDS.md) - Difficulty 所需字段
- [`docs/PHYSICAL-METADATA-REQUIRED-FIELDS.md`](./PHYSICAL-METADATA-REQUIRED-FIELDS.md) - Fatigue 所需字段
- [`docs/DIFFICULTY-VS-FATIGUE-ARCHITECTURE.md`](./DIFFICULTY-VS-FATIGUE-ARCHITECTURE.md) - 分轨道架构
- [`src/places/utils/gpx-fatigue-calculator.util.ts`](../src/places/utils/gpx-fatigue-calculator.util.ts) - GPX 计算器实现
- [`src/places/utils/gpx-parser.util.ts`](../src/places/utils/gpx-parser.util.ts) - GPX 解析器实现
