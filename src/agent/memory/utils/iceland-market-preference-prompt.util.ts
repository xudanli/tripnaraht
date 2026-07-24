// src/agent/memory/utils/iceland-market-preference-prompt.util.ts

/** 完整编排旁路键（与体能 hint 同模式；INTAKE 消费后剥离） */
export const ICELAND_MARKET_PRIOR_SYSTEM_HINT_KEY = '__icelandMarketPriorSystemHint';

const SNAPSHOT_KEY = 'iceland_market_segment';

export function buildIcelandMarketPriorBlockFromTravelPreference(
  pref: Record<string, unknown> | null | undefined,
): string {
  if (!pref || typeof pref !== 'object') return '';
  const raw = pref[SNAPSHOT_KEY];
  if (!raw || typeof raw !== 'object') return '';
  const block = (raw as Record<string, unknown>).promptBlockZh;
  return typeof block === 'string' ? block.trim() : '';
}
