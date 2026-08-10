/**
 * B2-NARRATION-FOCUS-GROUNDING
 * 轻量咨询叙述必须忠实消费 resolved Trip Day / Activity World State，禁止旁路补日。
 */

const DAY_WORLD_STATE_MARKER = '【日焦点 World State】';
const ACTIVITY_WORLD_STATE_MARKER = '【活动焦点 World State】';

export function tripContextHasDayWorldState(tripContextJoined: string): boolean {
  return String(tripContextJoined ?? '').includes(DAY_WORLD_STATE_MARKER);
}

export function tripContextHasActivityWorldState(tripContextJoined: string): boolean {
  return String(tripContextJoined ?? '').includes(ACTIVITY_WORLD_STATE_MARKER);
}

/**
 * 从 World State 块解析 focused DayN（若有）。
 */
export function parseFocusedDayFromWorldStateBlock(tripContextJoined: string): number | undefined {
  const m = String(tripContextJoined ?? '').match(/requestedDay=Day(\d+)/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * 用户话术是否带明确日焦点（DayN / 第N天 / [日程] DayN）。
 */
export function messageHasExplicitDayFocus(message: string): boolean {
  const raw = String(message ?? '');
  return (
    /\[日程\]\s*Day\s*[-_]?\s*\d+/i.test(raw) ||
    /\bDay\s*[-_]?\s*\d+\b/i.test(raw) ||
    /第\s*\d+\s*天/.test(raw)
  );
}

/**
 * 注入轻量 LLM 的叙述焦点 grounding 约束。
 * 应放在 prompt 末尾（紧邻「用户问题」前），提高遵守率。
 */
export function buildNarrationFocusGroundingPromptLines(input: {
  tripContextJoined: string;
  message: string;
}): string[] {
  const ctx = String(input.tripContextJoined ?? '');
  const msg = String(input.message ?? '');
  const hasDayWorld = tripContextHasDayWorldState(ctx);
  const hasActivityWorld = tripContextHasActivityWorldState(ctx);
  const focusDay = parseFocusedDayFromWorldStateBlock(ctx);
  const explicitDay = messageHasExplicitDayFocus(msg);

  if (hasDayWorld && focusDay != null) {
    return [
      '【叙述焦点 Grounding · 强制 · 最高优先级】上文「日焦点 World State」是本轮 Day 事实 SSOT；违反任一条即失败。',
      `1) Focused Day = Day${focusDay}：正文默认只讨论该日；**禁止**无依据写出 Day${focusDay + 1} 或其他未在 matchedActivityAcrossTrip 中的 DayN。`,
      '2) dayTheme ≠ confirmed item：必须区分「主题标记」与「已入库日程项」；禁止把主题写成已锁定活动。',
      '3) matchedActivityAcrossTrip：若匹配在其他日，必须明确写「实际安排在 DayX / 该日期」；禁止说成焦点日已有该活动。',
      '4) 跨日仅可引用 World State 已列出的 matchedActivityAcrossTrip，并标注为跨日对照。',
      '5) 无库存证据时不得断言「还有位置/有名额」。',
    ];
  }

  if (hasActivityWorld) {
    return [
      '【叙述焦点 Grounding · 强制 · 最高优先级】上文「活动焦点 World State」是本轮可引用行程日证据 SSOT。',
      '1) 只能引用 themeDaysMatching 与 matchedActivityAcrossTrip 中已列出的 Day/日期；**禁止**旁带未列出的观光日（如任意 Day5）作备选或衔接。',
      '2) dayTheme ≠ confirmed item：主题日必须写成主题/候选，不得写成已锁定场次。',
      '3) 谈实际入库活动时：必须点名 matched 所在 Day（如「实际安排在 Day3」）。',
      '4) 无库存证据时不得断言余位。',
    ];
  }

  if (!explicitDay && !hasDayWorld) {
    return [
      '【叙述焦点 Grounding · 无日焦点 · 最高优先级】用户本轮未指定 DayN，且无日/活动焦点 World State。',
      '首句须澄清指哪一项，或明确标注「行程内候选/主题，非已锁定场次」；禁止默认挑愿望单或骨架某一项当作用户所指。',
      '禁止把 metadata 日主题或骨架中的某一日，写成「你的 DayN 已安排××」；禁止编造具体日序/日历日作为既成安排。',
    ];
  }

  if (explicitDay && !hasDayWorld) {
    return [
      '【叙述焦点 Grounding · 最高优先级】用户指定了某一 Day，但上文缺少「日焦点 World State」。',
      '只基于已给出的按日骨架/速览作答；禁止补充未出现的 DayN 或日历日作为既成安排。',
    ];
  }

  return [];
}
