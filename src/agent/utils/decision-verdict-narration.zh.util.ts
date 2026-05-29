/**
 * 决策判决书 → 用户可读中文（Narrator / explain 摘要）
 */

import type { OptimizationDecisionVerdict } from '../../decision/kernel/decision-verdict.util';
import type { OptimizationHints } from '../../decision/kernel/decision-state.types';

export function formatDecisionVerdictNarrationZh(
  verdict: OptimizationDecisionVerdict | undefined,
  hints?: Pick<OptimizationHints, 'method' | 'metaDecisionAudit' | 'recommendedAlternativeId'>,
): string | undefined {
  if (!verdict?.chosen_plan_id) return undefined;

  const lines: string[] = [];
  lines.push(`**推荐方案：** \`${verdict.chosen_plan_id}\``);

  if (hints?.method) {
    lines.push(`- 优化方法：${hints.method}${hints.metaDecisionAudit ? `（${hints.metaDecisionAudit}）` : ''}`);
  }

  const mc = verdict.monte_carlo_summary;
  if (mc?.used && mc.total_samples) {
    lines.push(`- 后台已完成约 **${mc.total_samples}** 次不确定性抽样后再给出排序。`);
  }

  const rejected = verdict.rejected_plans ?? [];
  if (rejected.length) {
    lines.push('\n**未采纳方案：**');
    for (const r of rejected.slice(0, 5)) {
      const statusZh =
        r.status === 'infeasible' ? '不可行' : r.status === 'rejected' ? '可行但更差' : r.status;
      const reasons = (r.rejection_reasons ?? []).slice(0, 2).join('；') || '效用或可行性低于推荐方案';
      const delta =
        r.utility_delta_vs_chosen !== undefined
          ? `（相对推荐 ΔU≈${r.utility_delta_vs_chosen.toFixed(2)}）`
          : '';
      lines.push(`- \`${r.id}\`：${statusZh} — ${reasons}${delta}`);
    }
  }

  if (verdict.fallback_chain?.length) {
    lines.push('\n**降级说明：**');
    for (const f of verdict.fallback_chain) {
      lines.push(`- ${f.step}：${f.reason}`);
    }
  }

  return lines.join('\n');
}
