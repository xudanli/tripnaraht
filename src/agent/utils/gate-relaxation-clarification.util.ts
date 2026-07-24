/**
 * Gate BLOCK → gate_eval_relax_constraints 澄清注入（P0-2 / P1）
 * 禁止无 suggestions 的静默降级。
 */

import type { ClarificationQuestion } from '../interfaces/clarification.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import { buildRelaxationSuggestionsFromViolations } from './relaxation-constraint-write.util';

export function injectGateRelaxationClarificationIfEligible(state: OrchestratorState): boolean {
  if (state.gate_result?.gate_result !== 'BLOCK') return false;

  const existing = state.clarification_questions ?? [];
  if (existing.some((q) => q.id === 'gate_eval_relax_constraints')) return true;

  const meta = (state.metadata ?? {}) as Record<string, unknown>;
  const flawedBypass = meta.flawed_draft_narrate === true;
  const violations =
    (state.gate_result.violations as Array<{ type?: string; detail?: string; severity?: string }>) ?? [];

  if (flawedBypass && violations.length === 0) return false;

  const conflictType = violations.some((v) =>
    /reach|terrain|vehicle|f_road/i.test(String(v.type ?? '')),
  )
    ? ('REACHABILITY' as const)
    : violations.some((v) => /scope|pace|time|must/i.test(String(v.type ?? '')))
      ? ('SCOPE' as const)
      : violations.length > 1
        ? ('MIXED' as const)
        : undefined;

  const { suggestions, context } = buildRelaxationSuggestionsFromViolations({
    questionId: 'gate_eval_relax_constraints',
    violations,
    headlineZh: '当前方案被门控拦截，请选择一项约束放宽后再继续',
    conflictType,
    selectionMode: 'multi',
  });

  if (suggestions.length === 0) return false;

  const options = suggestions.map((s) => ({
    value: s.actionId,
    label: `${s.recommended ? '【推荐】' : ''}${s.labelZh}｜${s.descriptionZh}`,
    metadata: s.metadata,
  }));

  const violationHint = violations
    .map((v) => v.detail)
    .filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
    .slice(0, 3)
    .join('；');

  const question: ClarificationQuestion = {
    id: 'gate_eval_relax_constraints',
    question: `[SYSTEM_ACTION]: GATE_BLOCK 拦截。\n${context.failureProbHintZh ?? context.headlineZh ?? ''}\n请在继续规划前选择一项约束放宽。`,
    type: suggestions.length === 1 ? 'single_choice' : 'multi_choice',
    required: true,
    options,
    hint: violationHint || undefined,
  };

  state.clarification_questions = [
    ...existing.filter((q) => q.id !== 'gate_eval_relax_constraints'),
    question,
  ];

  state.metadata = {
    ...meta,
    started_at: typeof meta.started_at === 'string' ? meta.started_at : new Date().toISOString(),
    blocked: true,
    gate_relaxation_injected: true,
    last_updated_at: new Date().toISOString(),
  };

  return true;
}
