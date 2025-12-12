# NARA 提示集成指南

## 概述

NARA（Narrative, Action, Reflection, Anchor）提示系统为自然 POI 提供结构化的语义线索，帮助 LLM 生成更有故事感和深度的行程描述。

## 核心问题修复

### 问题：共享对象污染

**原问题**：
```typescript
// ❌ 错误：返回共享对象引用
const hint = this.getBaseHint(poi.subCategory);
hint.narrativeSeed = `...${hint.narrativeSeed}`; // 修改了共享模板
```

**修复方案**：
```typescript
// ✅ 正确：每次都返回新对象
const base = this.getBaseHint(poi.subCategory);
const hint: NaraHint = { ...base }; // 浅拷贝
```

### 修复后的 NaraHintService

1. **getBaseHint 返回拷贝**：
   ```typescript
   private getBaseHint(subCategory: IcelandNatureSubCategory): NaraHint {
     const hints = { ... };
     const base = hints[subCategory] ?? hints.other;
     return { ...base }; // 返回新对象
   }
   ```

2. **generateNaraHint 使用拷贝**：
   ```typescript
   generateNaraHint(poi: IcelandNaturePoi): NaraHint {
     const base = this.getBaseHint(poi.subCategory);
     const hint: NaraHint = { ...base }; // 浅拷贝
     // 安全地修改 hint，不影响 base
     return hint;
   }
   ```

3. **安全的字符串追加**：
   ```typescript
   const append = (original: string | undefined, extra: string): string =>
     original ? `${original} ${extra}` : extra;
   ```

## 数据流

### 1. POI 层 → NARA 提示生成

```typescript
// 从数据源导入自然 POI
const poi: IcelandNaturePoi = {
  id: 'uuid',
  subCategory: 'volcano',
  isActiveVolcano: true,
  // ...
};

// 生成 NARA 提示
const naraHint = naraHintService.generateNaraHint(poi);
// 结果：
// {
//   narrativeSeed: "在冰岛，Eyjafjallajökull是一座活火山，火山是地球内部力量的直接体现...",
//   actionHint: "...",
//   reflectionHint: "...",
//   anchorHint: "..."
// }
```

### 2. 活动映射 → 集成 NARA

```typescript
// 将 POI 映射为活动时间片
const activity = naturePoiMapperService.mapNaturePoiToActivitySlot(poi, {
  time: '09:30',
  language: 'zh-CN'
});

// activity.details.naraHint 已自动包含 NARA 提示
```

### 3. Prompt 生成 → 包含 NARA

```typescript
import { buildJourneyPrompt, ItineraryDay } from './utils/prompt-utils';

const days: ItineraryDay[] = [
  {
    day: 1,
    date: '2025-11-24',
    timeSlots: [activity1, activity2, ...] // 每个 activity 包含 naraHint
  }
];

const prompt = buildJourneyPrompt({
  language: 'zh-CN',
  startDate: '2025-11-24',
  targetDays: 3,
  days,
  destination: 'Iceland'
});

// prompt 中会自动包含 NARA 提示块
```

## Prompt 结构

生成的 prompt 结构如下：

```
# 行程生成上下文

## 基本信息
- 目的地：Iceland
- 开始日期：2025-11-24
- 行程天数：3 天

---

你将看到每个活动附带的「NARA 提示」，它们是系统根据自然景观和心理体验生成的【内部语义线索】：

- 请理解这些提示表达的情绪、故事弧线和行动建议。
- 在生成对用户展示的文案时，可以融入这些含义，但**不要逐字复述**提示内容。
- 可以结合 NARA 提示，设计更有故事感的描述、行动指引、反思问题或打卡方式。

---

## 行程活动与 NARA 提示（系统上下文）

### 第 1 天（2025-11-24）
- 时间：09:30 | 活动：Eyjafjallajökull | 类型：nature | 坐标：(63.63000, -19.61330)
  说明：火山区域请遵守安全规定，不要进入危险区域。这是活火山，请关注官方安全提示。
  NARA 提示（内部语义线索，请用于理解场景，不要逐字照搬）：
  - 叙事种子：在冰岛，Eyjafjallajökull是一座活火山，火山是地球内部力量的直接体现...
  - 行动建议：建议从不同角度观察火山形态，注意安全距离...
  - 反思提示：思考"变化"与"永恒"——火山在数千年间缓慢形成...
  - 锚定建议：记录下站在火山前的感受，这可能是你人生中距离地球内部力量最近的一次。

---

# 你的任务

根据上面的「用户画像 / 行程约束」和「每天的活动列表（含 NARA 提示）」：

1. 生成结构化的行程描述（保持既定天数和日期，不要更改坐标）。

2. 对于每个活动，写出：
   - 简短标题
   - 1–2 句具体场景描述（可以融入 NARA 的氛围）
   - 如有必要的行动指南或安全提示

3. 不要虚构不存在的地点或错误的地理信息。地点名称和坐标必须与提供的数据一致。
```

## API 使用示例

### 1. 生成 NARA 提示

```typescript
// 在服务中
const poi = await naturePoiService.findNaturePoisByCategory('volcano', 'IS', 1);
const naraHint = naraHintService.generateNaraHint(poi[0]);
```

### 2. 映射为活动（自动包含 NARA）

```typescript
const activity = naturePoiMapperService.mapNaturePoiToActivitySlot(poi, {
  time: '09:30',
  language: 'zh-CN'
});
// activity.details.naraHint 已自动填充
```

### 3. 构建 Prompt

```typescript
import { buildJourneyPrompt } from '@/places/utils/prompt-utils';

const prompt = buildJourneyPrompt({
  language: 'zh-CN',
  startDate: '2025-11-24',
  targetDays: 3,
  days: [
    {
      day: 1,
      date: '2025-11-24',
      timeSlots: [activity1, activity2]
    }
  ],
  destination: 'Iceland'
});
```

## 关键设计点

### 1. 防止共享对象污染

- ✅ `getBaseHint` 返回新对象：`return { ...base }`
- ✅ `generateNaraHint` 使用拷贝：`const hint = { ...base }`
- ✅ 安全的字符串追加：使用 `append` 函数处理 `undefined`

### 2. NARA 作为内部语义线索

- 在 prompt 中明确标注为"内部语义线索"
- 要求 LLM "不要逐字复述"
- 让 LLM 理解并融入，而不是直接复制

### 3. 自动集成流程

- `NaturePoiMapperService` 自动调用 `NaraHintService`
- 映射时自动生成并附加 NARA 提示
- 无需手动调用

## 扩展建议

### 1. 多语言支持

```typescript
generateNaraHint(poi: IcelandNaturePoi, language?: 'zh-CN' | 'en'): NaraHint {
  // 根据语言返回不同版本的提示
}
```

### 2. 风格变体

```typescript
getBaseHint(
  subCategory: IcelandNatureSubCategory,
  style?: 'short' | 'normal' | 'poetic'
): NaraHint {
  // 根据风格返回不同深度的提示
}
```

### 3. 风险等级影响

```typescript
if (poi.hazardLevel === 'high' || poi.hazardLevel === 'extreme') {
  hint.actionHint = append(
    hint.actionHint,
    '⚠️ 务必遵守现场警示标志，不要进入危险区域。'
  );
}
```

## 测试建议

### 1. 测试共享对象问题

```typescript
const hint1 = naraHintService.generateNaraHint(poi1);
const hint2 = naraHintService.generateNaraHint(poi2);
// 确保 hint1 和 hint2 互不影响
```

### 2. 测试 Prompt 生成

```typescript
const prompt = buildJourneyPrompt({ ... });
// 验证 prompt 包含 NARA 提示块
expect(prompt).toContain('NARA 提示');
expect(prompt).toContain('不要逐字照搬');
```

### 3. 测试 LLM 输出

- 验证 LLM 不会逐字复制 NARA 提示
- 验证 LLM 理解了 NARA 的语义并融入描述

## 相关文件

- `src/places/services/nara-hint.service.ts` - NARA 提示生成服务
- `src/places/services/nature-poi-mapper.service.ts` - POI 到活动映射（集成 NARA）
- `src/places/utils/prompt-utils.ts` - Prompt 生成工具
- `src/places/interfaces/nature-poi.interface.ts` - 类型定义
