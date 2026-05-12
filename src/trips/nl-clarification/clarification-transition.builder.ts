/**
 * Clarification DSL → 用户可见文案（唯一问题源原则）
 * LLM 仅用于少量全局解析；轮次内具体问题仅以配置卡片为准。
 */

export interface ClarificationCardLite {
  /** 卡片题干（与 clarificationQuestions[].question 一致） */
  question?: string;
}

export interface RoundLite {
  name?: string;
  roundId?: string;
}

/**
 * 由当前轮次 DSL 卡片生成气泡内过渡正文（不含编号式 LLM 追问清单）。
 */
export function buildTransitionFromRound(round: RoundLite, cards: ClarificationCardLite[]): string {
  const titles = cards
    .map((c) => (c.question || '').replace(/\*+$/g, '').trim())
    .filter(Boolean);

  const topicLine =
    titles.length > 0 ? `下方将依次确认：${titles.join('；')}。` : '请完成下方卡片中的选项。';

  const head = round?.name ? `进入「${round.name}」阶段。${topicLine}` : topicLine;

  return `${head}\n\n所有具体问题以卡片为准；无需在对话里重复罗列待填项。`.trim();
}

/**
 * 快捷 pill 文案：与 DSL 卡片题干同源（最多 5 条），替代 LLM 自由发挥的 suggestedQuestions。
 */
export function buildSuggestedPillsFromCards(cards: ClarificationCardLite[]): string[] {
  return cards
    .map((c) => (c.question || '').replace(/\*+$/g, '').trim())
    .filter(Boolean)
    .slice(0, 5);
}
