"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildNaraHintBlock = buildNaraHintBlock;
exports.buildTimeSlotBlock = buildTimeSlotBlock;
exports.buildDayBlock = buildDayBlock;
exports.buildNaraInstruction = buildNaraInstruction;
exports.buildTaskInstruction = buildTaskInstruction;
exports.buildJourneyPrompt = buildJourneyPrompt;
function buildNaraHintBlock(hint, language = 'zh-CN') {
    if (!hint)
        return '';
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
function buildTimeSlotBlock(slot, language) {
    var _a, _b, _c, _d, _e, _f;
    const name = ((_b = (_a = slot.details) === null || _a === void 0 ? void 0 : _a.name) === null || _b === void 0 ? void 0 : _b.chinese) ||
        ((_d = (_c = slot.details) === null || _c === void 0 ? void 0 : _c.name) === null || _d === void 0 ? void 0 : _d.english) ||
        slot.title;
    const coord = slot.coordinates || ((_e = slot.details) === null || _e === void 0 ? void 0 : _e.coordinates);
    const coordText = coord
        ? `(${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)})`
        : '';
    const baseLines = [];
    if (String(language).startsWith('zh')) {
        baseLines.push(`- 时间：${slot.time} | 活动：${name} | 类型：${slot.type}${coordText ? ` | 坐标：${coordText}` : ''}`);
        if (slot.notes) {
            baseLines.push(`  说明：${slot.notes}`);
        }
    }
    else {
        baseLines.push(`- Time: ${slot.time} | Activity: ${name} | Type: ${slot.type}${coordText ? ` | Coordinates: ${coordText}` : ''}`);
        if (slot.notes) {
            baseLines.push(`  Notes: ${slot.notes}`);
        }
    }
    const naraBlock = buildNaraHintBlock((_f = slot.details) === null || _f === void 0 ? void 0 : _f.naraHint, language);
    if (naraBlock)
        baseLines.push(naraBlock);
    return baseLines.join('\n');
}
function buildDayBlock(day, language) {
    const header = String(language).startsWith('zh')
        ? `### 第 ${day.day} 天（${day.date}）`
        : `### Day ${day.day} (${day.date})`;
    const slots = day.timeSlots
        .map((slot) => buildTimeSlotBlock(slot, language))
        .join('\n');
    return `${header}\n${slots}`;
}
function buildNaraInstruction(language) {
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
function buildTaskInstruction(language) {
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
function buildJourneyPrompt(args) {
    const { language, days } = args;
    const metaBlock = buildMetaBlock(args);
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
function formatUserPreferences(preferences, language) {
    const lines = [];
    const isZh = String(language).startsWith('zh');
    if (!preferences) {
        return lines;
    }
    if (preferences.preferredAttractionTypes && preferences.preferredAttractionTypes.length > 0) {
        if (isZh) {
            lines.push(`- 喜欢的景点类型：${preferences.preferredAttractionTypes.join('、')}`);
        }
        else {
            lines.push(`- Preferred Attraction Types: ${preferences.preferredAttractionTypes.join(', ')}`);
        }
    }
    if (preferences.dietaryRestrictions && preferences.dietaryRestrictions.length > 0) {
        if (isZh) {
            lines.push(`- 饮食禁忌：${preferences.dietaryRestrictions.join('、')}`);
        }
        else {
            lines.push(`- Dietary Restrictions: ${preferences.dietaryRestrictions.join(', ')}`);
        }
    }
    if (preferences.preferOffbeatAttractions !== undefined) {
        if (isZh) {
            lines.push(`- 偏好小众景点：${preferences.preferOffbeatAttractions ? '是' : '否'}`);
        }
        else {
            lines.push(`- Prefer Offbeat Attractions: ${preferences.preferOffbeatAttractions ? 'Yes' : 'No'}`);
        }
    }
    if (preferences.travelPreferences) {
        const tp = preferences.travelPreferences;
        const tpLines = [];
        if (tp.pace) {
            if (isZh) {
                tpLines.push(`节奏：${tp.pace === 'LEISURE' ? '休闲' : tp.pace === 'MODERATE' ? '适中' : tp.pace === 'FAST' ? '快速' : tp.pace}`);
            }
            else {
                tpLines.push(`Pace: ${tp.pace}`);
            }
        }
        if (tp.budget) {
            if (isZh) {
                tpLines.push(`预算：${tp.budget === 'LOW' ? '低' : tp.budget === 'MEDIUM' ? '中' : tp.budget === 'HIGH' ? '高' : tp.budget}`);
            }
            else {
                tpLines.push(`Budget: ${tp.budget}`);
            }
        }
        if (tp.accommodation) {
            if (isZh) {
                tpLines.push(`住宿：${tp.accommodation === 'BUDGET' ? '经济型' : tp.accommodation === 'COMFORTABLE' ? '舒适型' : tp.accommodation === 'LUXURY' ? '豪华型' : tp.accommodation}`);
            }
            else {
                tpLines.push(`Accommodation: ${tp.accommodation}`);
            }
        }
        if (tpLines.length > 0) {
            if (isZh) {
                lines.push(`- 出行偏好：${tpLines.join('，')}`);
            }
            else {
                lines.push(`- Travel Preferences: ${tpLines.join(', ')}`);
            }
        }
    }
    if (preferences.other && Object.keys(preferences.other).length > 0) {
        if (isZh) {
            lines.push(`- 其他偏好：${JSON.stringify(preferences.other)}`);
        }
        else {
            lines.push(`- Other Preferences: ${JSON.stringify(preferences.other)}`);
        }
    }
    return lines;
}
function buildMetaBlock(args) {
    const { language, startDate, targetDays, destination, userCountry, budgetConfig, pacingConfig, userPreferences } = args;
    const isZh = String(language).startsWith('zh');
    const lines = [];
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
        if (userPreferences) {
            lines.push('');
            lines.push(`## 用户偏好`);
            const preferenceLines = formatUserPreferences(userPreferences, language);
            if (preferenceLines.length > 0) {
                lines.push(...preferenceLines);
            }
            else {
                lines.push(`- 用户尚未设置偏好信息`);
            }
        }
    }
    else {
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
        if (userPreferences) {
            lines.push('');
            lines.push(`## User Preferences`);
            const preferenceLines = formatUserPreferences(userPreferences, language);
            if (preferenceLines.length > 0) {
                lines.push(...preferenceLines);
            }
            else {
                lines.push(`- User has not set preferences yet`);
            }
        }
    }
    return lines.join('\n');
}
//# sourceMappingURL=prompt-utils.js.map