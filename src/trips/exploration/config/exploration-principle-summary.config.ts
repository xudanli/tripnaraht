/** 原则页「系统智能总结」— feature flag SSOT */

export function isPrincipleSummaryEnabled(): boolean {
  const raw = process.env.EXPLORATION_PRINCIPLE_SUMMARY?.trim();
  if (raw === '0') return false;
  return raw === '1' || process.env.EXPLORATION_CONSUMER_MVP_ENABLED === '1';
}

/** 真实 LLM 调用（需 API key）；未开时走 RULES 模板 */
export function isLlmPrincipleSummaryLive(): boolean {
  return process.env.EXPLORATION_LLM_PRINCIPLE_SUMMARY_LIVE === '1';
}
