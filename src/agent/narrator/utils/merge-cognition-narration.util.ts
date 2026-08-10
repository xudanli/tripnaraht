import type { DecisionCognitionSlice } from '../../../decision/kernel/decision-cognition.types';
import type { NarrationLike } from '../../../decision/kernel/interfaces/phase-executor.interface';

/**
 * 将认知四步产物投影到用户可读叙述（发生了什么 → 为何重要 → 方案与未来）。
 * NARRATE 不属于四步本身，只负责表达。
 */
export function mergeCognitionIntoNarration(
  narration: NarrationLike,
  cognition: DecisionCognitionSlice | undefined,
): NarrationLike {
  if (!cognition) return narration;

  const tips = [...(narration.tips ?? [])];
  const warnings = [...(narration.warnings ?? [])];
  let summary = narration.user_friendly_summary ?? '';

  const focus = cognition.focusedProblem;
  if (focus) {
    const focusLine = `[决策焦点] ${focus.question}`;
    if (!tips.some((t) => t.includes('决策焦点') || t.includes(focus.question))) {
      tips.unshift(focusLine);
    }
    if (focus.whyThisProblem && !tips.some((t) => t.includes(focus.whyThisProblem.slice(0, 24)))) {
      tips.push(`为何现在处理：${focus.whyThisProblem}`);
    }
    for (const sec of focus.suppressedSecondaryProblems.slice(0, 3)) {
      const line = `次要症状（已压后）：${sec}`;
      if (!tips.includes(line)) tips.push(line);
    }
    if (focus.gateDisposition === 'NEED_CONFIRM' || focus.gateDisposition === 'REJECT') {
      const w = `需要您确认后再继续：${focus.question}`;
      if (!warnings.some((x) => String(x).includes(focus.question))) warnings.push(w);
    }
    if (!summary.includes(focus.question.slice(0, 16))) {
      summary = summary
        ? `${summary}\n\n当前决策焦点：${focus.question}`
        : `当前决策焦点：${focus.question}`;
    }
  }

  const future = cognition.futureSimulation;
  if (future) {
    const statusLine = `预演校验：${future.verification.status}`;
    if (!tips.some((t) => t.startsWith('预演校验'))) tips.push(statusLine);
    if (future.recommendedAlternativeId) {
      const rec = `推荐方案：${future.recommendedAlternativeId}`;
      if (!tips.includes(rec)) tips.push(rec);
    }
    for (const alt of future.alternatives.slice(0, 2)) {
      const line = `备选未来：${alt.label}`;
      if (!tips.includes(line)) tips.push(line);
    }
  }

  const markers = cognition.markers ?? [];
  return {
    ...narration,
    user_friendly_summary: summary,
    tips,
    warnings,
    cognition_summary: {
      decision_depth: cognition.decisionDepth,
      markers,
      focused_problem_id: focus?.problemId,
      focused_question: focus?.question,
      future_status: future?.verification.status,
      recommended_alternative_id: future?.recommendedAlternativeId,
    },
  };
}
