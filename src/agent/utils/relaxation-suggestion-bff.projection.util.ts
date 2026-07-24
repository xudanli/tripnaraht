/**
 * RelaxationSuggestionBar BFF — 将编排侧放宽选项投影为 C 端可渲染结构。
 * 数据源：clarification_questions + early_warning + Gate/Verify BLOCK 违规投影
 */

import type { ClarificationQuestion } from '../interfaces/clarification.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { GateResult } from '../interfaces/trip-plan.interface';
import type { EarlyWarning } from '../services/shadow-conflict-scanner.service';
import type { RelaxationActionId } from '../cbr/constraint-scorer.util';
import { buildRelaxationSuggestionsFromViolations } from './relaxation-constraint-write.util';

export const RELAXATION_CLARIFICATION_QUESTION_IDS = new Set([
  'early_warning_relaxations',
  'plan_gen_empty_draft_relax_constraints',
  'gate_eval_relax_constraints',
  'verify_relax_constraints',
  'planning_conflicts_relax_constraints',
  'utility_decay_halt_confirmation',
  'repair_halt_confirmation',
]);

export type RelaxationSuggestionKind =
  | 'relaxation'
  | 'proceed_at_own_risk'
  | 'accept_no_solution'
  | 'manual_relax_constraints';

export type RelaxationSuggestionConfidence = 'high_probability_fixed' | 'needs_more_changes';

export type RelaxationSuggestionPathGroup = 'path_a' | 'path_b' | 'other';

export type RelaxationSuggestionDto = {
  schema: 'tripnara.relaxation_suggestion@v1';
  actionId: RelaxationActionId | string;
  labelZh: string;
  descriptionZh: string;
  kind: RelaxationSuggestionKind;
  confidence?: RelaxationSuggestionConfidence;
  score?: number;
  pathGroup?: RelaxationSuggestionPathGroup;
  recommended?: boolean;
  metadata?: {
    constraint_id?: string;
    fixed_conflict_types?: string[];
    violations_before?: number;
    violations_after?: number;
    dominant_cid?: string;
  };
};

export type RelaxationSuggestionsContextDto = {
  schema: 'tripnara.relaxation_suggestions@v1';
  questionId: string;
  selectionMode: 'single' | 'multi';
  headlineZh?: string;
  hintZh?: string;
  earlyWarningId?: string;
  riskLevel?: EarlyWarning['risk_level'];
  conflictType?: EarlyWarning['conflict_type'];
  evidenceSummaryZh?: string;
  failureRiskScore?: number;
  failureProbHintZh?: string;
};

export const RELAXATION_ACTION_DISPLAY_ZH: Record<
  string,
  { labelZh: string; kind: RelaxationSuggestionKind }
> = {
  upgrade_vehicle_to_4wd: { labelZh: '升级四驱车辆', kind: 'relaxation' },
  increase_days_by_1: { labelZh: '增加 1 天行程', kind: 'relaxation' },
  drop_one_must_include_poi: { labelZh: '移除 1 个必去点', kind: 'relaxation' },
  proceed_at_own_risk: { labelZh: '自担风险继续规划', kind: 'proceed_at_own_risk' },
  accept_no_solution: { labelZh: '保持约束不变', kind: 'accept_no_solution' },
  manual_relax_constraints: { labelZh: '手动描述放宽约束', kind: 'manual_relax_constraints' },
  relax_budget_by_10pct: { labelZh: '预算放宽 10%', kind: 'relaxation' },
  relax_pace_to_conservative: { labelZh: '切换保守节奏', kind: 'relaxation' },
  reduce_scope: { labelZh: '缩小行程范围', kind: 'relaxation' },
};

const INTERNAL_LABEL_NOISE = [
  /^\[SYSTEM_ACTION\]:?\s*/i,
  /TERMINAL_NO_SOLUTION/gi,
  /CONSENSUS_REACHED:\s*NO_FEASIBLE_PATH/gi,
  /\[实验性\]\s*/g,
];

function stripInternalLabelNoise(text: string): string {
  let t = String(text ?? '').trim();
  for (const re of INTERNAL_LABEL_NOISE) {
    t = t.replace(re, '').trim();
  }
  return t.replace(/\s{2,}/g, ' ').trim();
}

function resolveKind(actionId: string): RelaxationSuggestionKind {
  return RELAXATION_ACTION_DISPLAY_ZH[actionId]?.kind ?? 'relaxation';
}

function resolveLabelZh(actionId: string, optionLabel: string): string {
  const preset = RELAXATION_ACTION_DISPLAY_ZH[actionId]?.labelZh;
  if (preset) return preset;
  const cleaned = stripInternalLabelNoise(optionLabel);
  const pipeIdx = cleaned.indexOf('｜');
  if (pipeIdx > 0) {
    const head = cleaned.slice(0, pipeIdx).trim();
    if (!head.includes('_') && head.length <= 40) return head;
    return cleaned.slice(pipeIdx + 1).replace(/（[^）]*）$/u, '').trim() || cleaned;
  }
  return cleaned.slice(0, 80) || actionId;
}

function resolveDescriptionZh(
  actionId: string,
  optionLabel: string,
  impactFromEw?: string,
): string {
  if (impactFromEw?.trim()) return stripInternalLabelNoise(impactFromEw);
  const cleaned = stripInternalLabelNoise(optionLabel);
  const pipeIdx = cleaned.indexOf('｜');
  if (pipeIdx >= 0) {
    const tail = cleaned
      .slice(pipeIdx + 1)
      .replace(/（high_probability_fixed|needs_more_changes）/gi, '')
      .trim();
    if (tail) return tail;
  }
  return RELAXATION_ACTION_DISPLAY_ZH[actionId]?.labelZh ?? cleaned;
}

function parseConfidence(
  optionMeta: Record<string, unknown> | undefined,
  optionLabel: string,
): RelaxationSuggestionConfidence | undefined {
  const fromLabel = optionLabel.match(/（(high_probability_fixed|needs_more_changes)）/i)?.[1];
  if (fromLabel === 'high_probability_fixed' || fromLabel === 'needs_more_changes') {
    return fromLabel;
  }
  const raw = optionMeta?.shadow_confidence;
  if (raw === 'high_probability_fixed' || raw === 'needs_more_changes') return raw;
  return undefined;
}

function mapPathGroup(raw: unknown): RelaxationSuggestionPathGroup | undefined {
  const p = String(raw ?? '').toUpperCase();
  if (p === 'PATH_A' || p === 'PATHA') return 'path_a';
  if (p === 'PATH_B' || p === 'PATHB') return 'path_b';
  if (p === 'OTHER') return 'other';
  return undefined;
}

function normalizeOption(
  opt: string | { value: string; label: string; metadata?: Record<string, unknown> },
): { value: string; label: string; metadata?: Record<string, unknown> } {
  if (typeof opt === 'string') return { value: opt, label: opt };
  return {
    value: String(opt.value ?? ''),
    label: String(opt.label ?? opt.value ?? ''),
    metadata: opt.metadata as Record<string, unknown> | undefined,
  };
}

function resolveEarlyWarningInterceptMeta(state?: OrchestratorState | null): {
  failureRiskScore?: number;
  failureProbHintZh?: string;
} {
  if (!state?.decision_log?.length) return {};
  for (let i = state.decision_log.length - 1; i >= 0; i -= 1) {
    const md = state.decision_log[i]?.metadata as Record<string, unknown> | undefined;
    if (md?.system_action !== 'EARLY_WARNING_INTERCEPT') continue;
    return {
      failureRiskScore:
        typeof md.failure_risk_score === 'number' ? md.failure_risk_score : undefined,
      failureProbHintZh:
        typeof md.failure_prob_hint === 'string' ? md.failure_prob_hint : undefined,
    };
  }
  return {};
}

function headlineFromQuestion(question: ClarificationQuestion): string {
  const raw = String(question.question_html ? question.question : question.question ?? '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^#+\s+/gm, '')
    .trim();
  const firstLine = raw.split(/\n/)[0]?.trim() ?? raw;
  return stripInternalLabelNoise(firstLine).slice(0, 300);
}

export function isRelaxationClarificationQuestionId(questionId: string | undefined): boolean {
  return RELAXATION_CLARIFICATION_QUESTION_IDS.has(String(questionId ?? ''));
}

export function findRelaxationClarificationQuestion(
  questions: ClarificationQuestion[] | undefined,
): ClarificationQuestion | undefined {
  if (!Array.isArray(questions)) return undefined;
  return questions.find((q) => isRelaxationClarificationQuestionId(q?.id));
}

export function projectRelaxationSuggestions(input: {
  clarificationQuestions?: ClarificationQuestion[];
  orchestratorState?: OrchestratorState | null;
}): { suggestions: RelaxationSuggestionDto[]; context: RelaxationSuggestionsContextDto } | undefined {
  const question = findRelaxationClarificationQuestion(input.clarificationQuestions);
  if (!question || !Array.isArray(question.options) || question.options.length === 0) {
    return undefined;
  }

  const ew = (input.orchestratorState?.metadata as Record<string, unknown> | undefined)
    ?.early_warning as EarlyWarning | undefined;
  const ewByAction = new Map<string, (typeof ew) extends undefined ? never : NonNullable<typeof ew>['suggested_actions'][number]>();
  for (const s of ew?.suggested_actions ?? []) {
    if (s?.relaxation_type) ewByAction.set(s.relaxation_type, s);
  }

  const interceptMeta = resolveEarlyWarningInterceptMeta(input.orchestratorState);

  const rawSuggestions = question.options.map((opt) => {
    const { value, label, metadata } = normalizeOption(opt);
    const actionId = value;
    const ewAction = ewByAction.get(actionId);
    const optionMeta = metadata ?? (ewAction as unknown as Record<string, unknown> | undefined);
    const confidence =
      ewAction?.shadow_confidence ?? parseConfidence(optionMeta, label);
    const score =
      typeof metadata?.score === 'number' && Number.isFinite(metadata.score)
        ? metadata.score
        : undefined;

    const suggestion: RelaxationSuggestionDto = {
      schema: 'tripnara.relaxation_suggestion@v1',
      actionId,
      labelZh: resolveLabelZh(actionId, label),
      descriptionZh: resolveDescriptionZh(actionId, label, ewAction?.impact_description),
      kind: resolveKind(actionId),
      ...(confidence ? { confidence } : {}),
      ...(score != null ? { score } : {}),
      ...(mapPathGroup(metadata?.path) ? { pathGroup: mapPathGroup(metadata?.path) } : {}),
      metadata: {
        ...(Array.isArray(ewAction?.fixed_conflict_types) && ewAction.fixed_conflict_types.length
          ? { fixed_conflict_types: ewAction.fixed_conflict_types }
          : {}),
        ...(typeof ewAction?.violations_before === 'number'
          ? { violations_before: ewAction.violations_before }
          : {}),
        ...(typeof ewAction?.violations_after === 'number'
          ? { violations_after: ewAction.violations_after }
          : {}),
        ...(typeof metadata?.dominant_cid === 'string'
          ? { dominant_cid: metadata.dominant_cid }
          : {}),
      },
    };

    return suggestion;
  });

  rawSuggestions.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));

  const topRelaxationIdx = rawSuggestions.findIndex(
    (s) => s.kind === 'relaxation' && s.actionId !== 'proceed_at_own_risk',
  );
  if (topRelaxationIdx >= 0) {
    rawSuggestions[topRelaxationIdx] = { ...rawSuggestions[topRelaxationIdx], recommended: true };
  }

  const context: RelaxationSuggestionsContextDto = {
    schema: 'tripnara.relaxation_suggestions@v1',
    questionId: question.id,
    selectionMode: question.type === 'single_choice' ? 'single' : 'multi',
    headlineZh: headlineFromQuestion(question),
    ...(question.hint?.trim() ? { hintZh: stripInternalLabelNoise(question.hint) } : {}),
    ...(ew?.early_warning_id ? { earlyWarningId: ew.early_warning_id } : {}),
    ...(ew?.risk_level ? { riskLevel: ew.risk_level } : {}),
    ...(ew?.conflict_type ? { conflictType: ew.conflict_type } : {}),
    ...(ew?.evidence_summary?.trim()
      ? { evidenceSummaryZh: stripInternalLabelNoise(ew.evidence_summary) }
      : {}),
    ...(interceptMeta.failureRiskScore != null
      ? { failureRiskScore: interceptMeta.failureRiskScore }
      : {}),
    ...(interceptMeta.failureProbHintZh
      ? { failureProbHintZh: stripInternalLabelNoise(interceptMeta.failureProbHintZh) }
      : {}),
  };

  return { suggestions: rawSuggestions, context };
}

function resolveBlockedRelaxationFromState(input: {
  orchestratorState?: OrchestratorState | null;
  gateResult?: GateResult | null;
  decisionViolations?: Array<{ type?: string; detail?: string; severity?: string }>;
}): { suggestions: RelaxationSuggestionDto[]; context: RelaxationSuggestionsContextDto } | undefined {
  const gate = input.gateResult ?? input.orchestratorState?.gate_result;
  const gateStatus = gate?.gate_result;
  const isBlocked =
    gateStatus === 'BLOCK' ||
    gateStatus === 'NEED_USER_CONFIRM' ||
    (input.orchestratorState?.metadata as Record<string, unknown> | undefined)?.blocked === true;

  const violations =
    input.decisionViolations ??
    (gate?.violations as Array<{ type?: string; detail?: string; severity?: string }> | undefined) ??
    [];

  if (!isBlocked && violations.length === 0) return undefined;

  const flawedBypass =
    (input.orchestratorState?.metadata as Record<string, unknown> | undefined)?.flawed_draft_narrate ===
    true;
  if (flawedBypass && violations.length === 0) return undefined;

  const step = String(input.orchestratorState?.current_step ?? '').toUpperCase();
  const questionId =
    step.includes('VERIFY') || step.includes('REPAIR')
      ? 'verify_relax_constraints'
      : step.includes('GATE')
        ? 'gate_eval_relax_constraints'
        : 'planning_conflicts_relax_constraints';

  const conflictType: EarlyWarning['conflict_type'] | undefined = violations.some((v) =>
    /reach|terrain|vehicle|f_road/i.test(String(v.type ?? '')),
  )
    ? 'REACHABILITY'
    : violations.some((v) => /scope|pace|time|must/i.test(String(v.type ?? '')))
      ? 'SCOPE'
      : violations.length > 1
        ? 'MIXED'
        : undefined;

  return buildRelaxationSuggestionsFromViolations({
    questionId,
    violations,
    headlineZh:
      gateStatus === 'BLOCK'
        ? '当前方案被门控拦截，请选择一项约束放宽后再继续'
        : '当前约束无法同时满足，请选择修复方向',
    conflictType,
    selectionMode: 'multi',
  });
}

/** 冲突已修复（放宽已应用且 Gate 不再 BLOCK）时清除 RelaxationSuggestionBar */
export function shouldSuppressRelaxationAfterConflictResolved(input: {
  clarificationQuestions?: ClarificationQuestion[];
  orchestratorState?: OrchestratorState | null;
  gateResult?: GateResult | null;
}): boolean {
  const meta = (input.orchestratorState?.metadata ?? {}) as Record<string, unknown>;
  const applied = meta.applied_relaxations;
  const persisted = meta.trip_relaxation_persisted;
  const hasApplied =
    (Array.isArray(applied) && applied.length > 0) ||
    (persisted != null && typeof persisted === 'object');

  if (!hasApplied) return false;

  const gateStatus =
    input.gateResult?.gate_result ?? input.orchestratorState?.gate_result?.gate_result;
  if (gateStatus === 'BLOCK') return false;

  const activeClarification =
    input.clarificationQuestions?.some((q) => isRelaxationClarificationQuestionId(q?.id)) ||
    input.orchestratorState?.clarification_questions?.some((q) =>
      isRelaxationClarificationQuestionId(q?.id),
    );
  if (activeClarification) return false;

  return gateStatus === 'ALLOW' || gateStatus === 'ADJUST_REQUIRED' || gateStatus === undefined;
}

export function attachRelaxationSuggestionsToPayload(
  payload: Record<string, unknown>,
  input: {
    clarificationQuestions?: ClarificationQuestion[];
    orchestratorState?: OrchestratorState | null;
    gateResult?: GateResult | null;
    decisionViolations?: Array<{ type?: string; detail?: string; severity?: string }>;
  },
): void {
  if (shouldSuppressRelaxationAfterConflictResolved(input)) {
    delete payload.relaxation_suggestions;
    delete payload.relaxation_suggestions_context;
    const uiDisplay =
      payload.ui_display && typeof payload.ui_display === 'object' && !Array.isArray(payload.ui_display)
        ? (payload.ui_display as Record<string, unknown>)
        : undefined;
    if (uiDisplay) {
      delete uiDisplay.relaxation_suggestions;
      delete uiDisplay.relaxation_suggestions_context;
      payload.ui_display = uiDisplay;
    }
    return;
  }

  const projected =
    projectRelaxationSuggestions(input) ??
    resolveBlockedRelaxationFromState(input);
  if (!projected) {
    delete payload.relaxation_suggestions;
    delete payload.relaxation_suggestions_context;
    return;
  }
  payload.relaxation_suggestions = projected.suggestions;
  payload.relaxation_suggestions_context = projected.context;

  const uiDisplay =
    payload.ui_display && typeof payload.ui_display === 'object' && !Array.isArray(payload.ui_display)
      ? (payload.ui_display as Record<string, unknown>)
      : {};
  payload.ui_display = {
    ...uiDisplay,
    relaxation_suggestions: projected.suggestions,
    relaxation_suggestions_context: projected.context,
  };
}
