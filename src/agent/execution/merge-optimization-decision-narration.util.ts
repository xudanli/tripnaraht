/**
 * 将 DSO.optimizationHints 中的决策判决书并入 NarrationLike（不改行程硬字段）。
 */

import type { OptimizationHints } from '../../decision/kernel/decision-state.types';
import type { NarrationLike } from '../../decision/kernel/interfaces/phase-executor.interface';
import { buildDecisionVerdictFromHints } from '../../decision/kernel/decision-verdict.util';
import { formatDecisionVerdictNarrationZh } from '../utils/decision-verdict-narration.zh.util';
import { buildDegradationSummaryLine } from '../../trips/decision/narration/format-degradation-narrative.util';

export function mergeOptimizationDecisionNarration(
  narration: NarrationLike,
  hints?: OptimizationHints,
): NarrationLike {
  if (!hints) return narration;

  const verdictText =
    hints.decisionVerdictNarrationZh?.trim() ||
    formatDecisionVerdictNarrationZh(
      hints.decisionVerdict ?? buildDecisionVerdictFromHints(hints),
      hints,
    );
  if (!verdictText?.trim()) return narration;

  let summary = (narration.user_friendly_summary ?? '').trim();
  const anchor = verdictText.slice(0, Math.min(32, verdictText.length));
  if (!summary.includes(anchor)) {
    summary = summary ? `${summary}\n\n${verdictText}` : verdictText;
  }

  const tips = [...(narration.tips ?? [])];
  const audit = hints.metaDecisionAudit?.trim();
  if (audit) {
    const label = '[决策审计]';
    const line = `${label} ${audit}`.slice(0, 500);
    if (!tips.some((t) => t.startsWith(label))) {
      tips.unshift(line);
    }
  }

  const wm = hints.worldConstraintMaterialization;
  if (wm?.appliedEvents) {
    const label = '[路政约束]';
    const line =
      `${label} 已将 ${wm.appliedEvents} 条公告/路况结构化进世界约束（道路：${wm.roadIds.join('、') || '—'}）。`.slice(
        0,
        500,
      );
    if (!tips.some((t) => t.startsWith(label))) {
      tips.unshift(line);
    }
  }

  const degradationLine = buildDegradationSummaryLine(hints);
  if (degradationLine) {
    const label = '[系统降级说明]';
    if (!tips.some((t) => t.startsWith(label))) {
      tips.unshift(degradationLine);
    }
    if (!(summary.includes('降级') || summary.includes('Topology Lock'))) {
      summary = summary ? `${degradationLine}\n\n${summary}` : degradationLine;
    }
  }

  return {
    ...narration,
    user_friendly_summary: summary,
    tips,
    optimization_decision_narration_zh: verdictText,
  };
}
