/**
 * 6.3：研究侧「实时重跑」挫败感水位 — 写入 `research_data` 供 ToleranceCalculator / 协商报告读取。
 */

/** 与 `LeaderResearchWorkspace.researchData` 对齐的持久计数键 */
export const RESEARCH_REALTIME_REROLL_COUNT_KEY = '__research_realtime_reroll_count' as const;

export function readRealtimeRerollCount(researchData: Record<string, unknown> | undefined): number {
  if (!researchData) return 0;
  const v = researchData[RESEARCH_REALTIME_REROLL_COUNT_KEY];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return 0;
  return Math.min(99, Math.floor(v));
}

/** 成功完成一次预算仲裁等重跑后调用；返回新的计数 */
export function incrementRealtimeRerollCount(researchData: Record<string, unknown>): number {
  const n = readRealtimeRerollCount(researchData) + 1;
  researchData[RESEARCH_REALTIME_REROLL_COUNT_KEY] = n;
  return n;
}

/**
 * 重跑对挫败感的加性贡献（与 4.0 历史分相加后再 clamp）。
 * - 第 1 次：+0.05
 * - 第 2 次：累计 +0.2（与第一次相加 → 0.25）
 * - 第 3 次及以上：累计抬升至 0.52（与熔断阈值对齐，确保单独重跑信号也可触发熔断叙事）
 */
export function computeRerollFrustrationBump(realtimeRerollCount: number): number {
  const c = Math.max(0, Math.floor(realtimeRerollCount));
  if (c <= 0) return 0;
  if (c === 1) return 0.05;
  if (c === 2) return 0.25;
  return 0.52;
}
