// src/places/utils/prompt-utils.ts
import type { NaraHint, TimeSlotActivity } from '../interfaces/nature-poi.interface';

export type LanguageCode = 'zh-CN' | 'en' | string;

/**
 * 构建 NARA 提示块（用于 LLM prompt）
 * 
 * 注意：这是"模型内部语义提示"，提醒 LLM 不要逐字输出
 */
export function buildNaraHintBlock(hint?: NaraHint, language: LanguageCode = 'zh-CN'): string {
  if (!hint) return '';

  // 这里用"模型内部提示"的语气，提醒 LLM 不要逐字输出
  if (String(language).startsWith('zh')) {
    return [
      '  NARA 提示（内部语义线索，请用于理解场景，不要逐字照搬）：',
      hint.narrativeSeed ? `  - 叙事种子：${hint.narrativeSeed}` : '',
      hint.actionHint ? `  - 行动建议：${hint.actionHint}` : '',
      hint.reflectionHint ? `  - 反思提示：${hint.reflectionHint}` : '',
      hint.anchorHint ? `  - 锚定建议：${hint.anchorHint}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    '  NARA hint (internal semantic cues, use for reasoning, do NOT copy verbatim):',
    hint.narrativeSeed ? `  - Narrative seed: ${hint.narrativeSeed}` : '',
    hint.actionHint ? `  - Action hint: ${hint.actionHint}` : '',
    hint.reflectionHint ? `  - Reflection hint: ${hint.reflectionHint}` : '',
    hint.anchorHint ? `  - Anchor suggestion: ${hint.anchorHint}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * 构建时间片活动块（包含 NARA 提示）
 */
export function buildTimeSlotBlock(slot: TimeSlotActivity, language: LanguageCode): string {
  const name =
    slot.details?.name?.chinese ||
    slot.details?.name?.english ||
    slot.title;

  const coord = slot.coordinates || slot.details?.coordinates;

  const coordText = coord
    ? `(${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)})`
    : '';

  const baseLines: string[] = [];

  if (String(language).startsWith('zh')) {
    baseLines.push(
      `- 时间：${slot.time} | 活动：${name} | 类型：${slot.type}${
        coordText ? ` | 坐标：${coordText}` : ''
      }`
    );
    if (slot.notes) {
      baseLines.push(`  说明：${slot.notes}`);
    }
  } else {
    baseLines.push(
      `- Time: ${slot.time} | Activity: ${name} | Type: ${slot.type}${
        coordText ? ` | Coordinates: ${coordText}` : ''
      }`
    );
    if (slot.notes) {
      baseLines.push(`  Notes: ${slot.notes}`);
    }
  }

  const naraBlock = buildNaraHintBlock(slot.details?.naraHint, language);
  if (naraBlock) baseLines.push(naraBlock);

  return baseLines.join('\n');
}

/**
 * 行程天接口（用于 prompt 生成）
 */
export interface ItineraryDay {
  day: number;
  date: string; // "2025-11-24"
  timeSlots: TimeSlotActivity[];
}

/**
 * 构建单天的活动块
 */
export function buildDayBlock(day: ItineraryDay, language: LanguageCode): string {
  const header = String(language).startsWith('zh')
    ? `### 第 ${day.day} 天（${day.date}）`
    : `### Day ${day.day} (${day.date})`;

  const slots = day.timeSlots
    .map((slot) => buildTimeSlotBlock(slot, language))
    .join('\n');

  return `${header}\n${slots}`;
}

/**
 * 构建行程 Prompt 的参数接口
 */
export interface JourneyPromptArgs {
  language: LanguageCode;
  intent?: any; // IntentResult 或其他用户意图
  startDate: string;
  targetDays: number;
  days: ItineraryDay[]; // 已选好的天+活动
  userCountry?: string;
  destination?: string;
  budgetConfig?: any;
  pacingConfig?: any;
  // 其他需要的参数...
}

/**
 * 构建 NARA 使用说明（用于 prompt）
 */
export function buildNaraInstruction(language: LanguageCode): string {
  const isZh = String(language).startsWith('zh');

  return isZh
    ? `
你将看到每个活动附带的「NARA 提示」，它们是系统根据自然景观和心理体验生成的【内部语义线索】：

- 请理解这些提示表达的情绪、故事弧线和行动建议。
- 在生成对用户展示的文案时，可以融入这些含义，但**不要逐字复述**提示内容。
- 可以结合 NARA 提示，设计更有故事感的描述、行动指引、反思问题或打卡方式。`
    : `
You will see "NARA hints" attached to each activity. They are INTERNAL semantic cues:

- Use them to understand the emotional tone, narrative arc and suggested actions.
- When generating user-facing text, you may incorporate their meaning, but MUST NOT copy them verbatim.
- Combine NARA hints with the itinerary to design more narrative-rich descriptions, action guidance, reflection prompts, and anchors.`;
}

/**
 * 构建任务说明（用于 prompt）
 */
export function buildTaskInstruction(language: LanguageCode): string {
  const isZh = String(language).startsWith('zh');

  return isZh
    ? `
# 你的任务

根据上面的「用户画像 / 行程约束」和「每天的活动列表（含 NARA 提示）」：

1. 生成结构化的行程描述（保持既定天数和日期，不要更改坐标）。

2. 对于每个活动，写出：
   - 简短标题
   - 1–2 句具体场景描述（可以融入 NARA 的氛围）
   - 如有必要的行动指南或安全提示

3. 不要虚构不存在的地点或错误的地理信息。地点名称和坐标必须与提供的数据一致。`
    : `
# Your task

Using the "user profile / constraints" and the "per-day activity list (with NARA hints)":

1. Produce a structured itinerary description (keep days, dates and coordinates unchanged).

2. For each activity, write:
   - A short title
   - 1–2 sentences describing the concrete scene (you may incorporate NARA's atmosphere)
   - Optional action guidance or safety notes when relevant

3. Do NOT hallucinate new places or incorrect geography. Place names and coordinates must stay consistent with the provided data.`;
}

/**
 * 构建完整的行程 Prompt
 * 
 * 这是主要的 prompt 生成函数，整合了所有信息
 */
export function buildJourneyPrompt(args: JourneyPromptArgs): string {
  const { language, days } = args;

  // 1. 构建元信息块（用户偏好、目的地约束等）
  const metaBlock = buildMetaBlock(args);

  // 2. 把每天的活动 + NARA 提示转成一个结构化的 context
  const daysBlock = days
    .map((day) => buildDayBlock(day, language))
    .join('\n\n');

  const isZh = String(language).startsWith('zh');

  const naraInstruction = buildNaraInstruction(language);
  const taskInstruction = buildTaskInstruction(language);

  return [
    metaBlock,
    '---',
    naraInstruction,
    '---',
    isZh ? '## 行程活动与 NARA 提示（系统上下文）' : '## Itinerary activities with NARA hints (system context)',
    daysBlock,
    '---',
    taskInstruction,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * 构建元信息块（用户画像、行程约束等）
 * 
 * 这是一个示例实现，你可以根据实际需求扩展
 */
function buildMetaBlock(args: JourneyPromptArgs): string {
  const { language, startDate, targetDays, destination, userCountry, budgetConfig, pacingConfig } = args;
  const isZh = String(language).startsWith('zh');

  const lines: string[] = [];

  if (isZh) {
    lines.push('# 行程生成上下文');
    lines.push('');
    lines.push(`## 基本信息`);
    lines.push(`- 目的地：${destination || '未指定'}`);
    lines.push(`- 开始日期：${startDate}`);
    lines.push(`- 行程天数：${targetDays} 天`);
    if (userCountry) {
      lines.push(`- 用户国家：${userCountry}`);
    }
    if (budgetConfig) {
      lines.push(`- 预算配置：${JSON.stringify(budgetConfig)}`);
    }
    if (pacingConfig) {
      lines.push(`- 节奏配置：${JSON.stringify(pacingConfig)}`);
    }
  } else {
    lines.push('# Journey Generation Context');
    lines.push('');
    lines.push(`## Basic Information`);
    lines.push(`- Destination: ${destination || 'Not specified'}`);
    lines.push(`- Start Date: ${startDate}`);
    lines.push(`- Duration: ${targetDays} days`);
    if (userCountry) {
      lines.push(`- User Country: ${userCountry}`);
    }
    if (budgetConfig) {
      lines.push(`- Budget Config: ${JSON.stringify(budgetConfig)}`);
    }
    if (pacingConfig) {
      lines.push(`- Pacing Config: ${JSON.stringify(pacingConfig)}`);
    }
  }

  return lines.join('\n');
}
