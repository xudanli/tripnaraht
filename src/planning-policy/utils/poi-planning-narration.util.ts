/**
 * 基于 feasibility / 区域名生成简短用户提示（Phase 1.5）
 */
export function buildPoiPlanningNarrationHint(
  feasibility: 'ok' | 'tight' | 'failed',
  regionName: string | undefined,
  totalBudgetMinutes: number | undefined,
): string | undefined {
  const region = regionName ?? '当前区域';
  if (feasibility === 'failed' || feasibility === 'tight') {
    const budget = totalBudgetMinutes
      ? `约 ${Math.round(totalBudgetMinutes / 60)} 小时`
      : '当前';
    return `基于${budget}时间预算，本次仅保留${region}核心骨架点，不再加入补充站点。`;
  }
  return undefined;
}
