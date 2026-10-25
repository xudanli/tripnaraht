/**
 * Decision Problem 物化投影开关。
 * 默认开启；显式 DECISION_PROBLEM_PROJECTION=0 关闭（回退现算）。
 */
export function isDecisionProblemProjectionEnabled(): boolean {
  const v = process.env.DECISION_PROBLEM_PROJECTION?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  return true;
}
