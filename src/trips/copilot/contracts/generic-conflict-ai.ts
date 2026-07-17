/**
 * Generic schedule / planning conflict — Nara advisor + recommendation gate.
 *
 * AI may recommend ONLY options that passed Preview/Validate for the same problemRef.
 * Logical conflicts between page facts and claim times → DATA_CONFLICT (no recommend).
 */

export const GENERIC_CONFLICT_ADVISOR_PROMPT = `你是 Nara 行程决策顾问。

根据当前冲突事实和已验证方案，用最短中文解释为什么推荐该方案。

规则：
1. 不重复页面标题、问题名称和方案数量。
2. 只说明直接原因、关键影响和推荐理由。
3. 推荐必须来自已通过 Preview/Validate 的方案。
4. 时间、距离或费用不一致时返回 silent=true 且在 body 标明 DATA_CONFLICT（由服务端门禁处理，勿编造对齐）。
5. 无有效推荐时只解释冲突，不强行选择方案。
6. 最多 55 个汉字。

输出 JSON：
{"silent":false,"title":"不超过12字","body":"原因与影响","advice":"推荐及理由"}
（兼容 explanation↔body、suggestion↔advice）`;

export interface RecommendGateProblem {
  id: string;
  planVersion?: string | null;
  /** Fact labels already on the problem (e.g. "延迟至 12:30"). */
  factSummaries?: string[];
}

export interface RecommendGateOption {
  optionId: string;
  title?: string;
  allowed?: boolean;
}

/**
 * Normalized preview used by Copilot recommend gate.
 * Built from Gateway option preview + problem versions.
 */
export interface RecommendGatePreview {
  problemId: string;
  optionId: string;
  /** Preview call succeeded and option is considered resolved/feasible. */
  resolved: boolean;
  remainingBlockingIssues: string[];
  planVersion?: string | null;
  /** Human deltas claimed by preview (for DATA_CONFLICT checks). */
  claimedLabels?: string[];
}

export function canRecommendOption(
  problem: RecommendGateProblem,
  option: RecommendGateOption,
  preview: RecommendGatePreview,
): boolean {
  if (!option.optionId || option.allowed === false) return false;
  if (preview.optionId !== option.optionId) return false;
  if (preview.problemId !== problem.id) return false;
  if (preview.resolved !== true) return false;
  if ((preview.remainingBlockingIssues?.length ?? 0) > 0) return false;
  if (
    problem.planVersion != null &&
    preview.planVersion != null &&
    problem.planVersion !== preview.planVersion
  ) {
    return false;
  }
  return true;
}

/**
 * Detect clock/metric contradiction between problem facts and recommendation copy
 * (e.g. page says 17:00 delay but advice says 12:30).
 */
export function detectDataConflict(input: {
  factSummaries?: string[];
  recommendationText?: string;
  claimedLabels?: string[];
}): boolean {
  const facts = [...(input.factSummaries ?? []), ...(input.claimedLabels ?? [])].join(' ');
  const rec = input.recommendationText ?? '';
  const factTimes = extractClockLabels(facts);
  const recTimes = extractClockLabels(rec);
  if (!factTimes.length || !recTimes.length) return false;
  // Conflict when recommendation asserts a clock that never appears in facts
  // and facts assert a different clock (classic 17:00 vs 12:30 bug).
  const factSet = new Set(factTimes);
  const foreign = recTimes.filter((t) => !factSet.has(t));
  if (foreign.length === 0) return false;
  return factTimes.some((t) => !recTimes.includes(t));
}

function extractClockLabels(text: string): string[] {
  const out = new Set<string>();
  const re = /(\d{1,2})\s*[:：]\s*(\d{2})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const h = Number(m[1]);
    const min = m[2];
    if (h >= 0 && h <= 23) {
      out.add(`${h}:${min}`);
    }
  }
  return [...out];
}

export function pickValidatedRecommendation(input: {
  problem: RecommendGateProblem;
  options: RecommendGateOption[];
  previews: RecommendGatePreview[];
}): { option: RecommendGateOption; preview: RecommendGatePreview } | null {
  for (const option of input.options) {
    const preview = input.previews.find((p) => p.optionId === option.optionId);
    if (!preview) continue;
    if (canRecommendOption(input.problem, option, preview)) {
      if (
        detectDataConflict({
          factSummaries: input.problem.factSummaries,
          recommendationText: option.title,
          claimedLabels: preview.claimedLabels,
        })
      ) {
        continue;
      }
      return { option, preview };
    }
  }
  return null;
}

export function buildNoValidatedRecommendationSelection(input: {
  focusedProblemId: string;
  conflictSummary: string;
  dataConflict?: boolean;
}): {
  mode: 'ATTENTION';
  priority: 'P1';
  insightType: 'DATA_UNCERTAINTY' | 'EXPLANATION';
  title: string;
  observationSummary: string;
  explanationSummary: string;
  impacts: [];
  recommendation: undefined;
  actions: Array<{
    kind: 'PREVIEW';
    label: string;
    actionType: 'COMPARE_OPTIONS';
    payloadRef: string;
  }>;
  confidence: number;
  evidenceRefs: string[];
  factRefs: string[];
  focusedProblemId: string;
  modeReason: 'NO_VALIDATED_RECOMMENDATION' | 'DATA_CONFLICT';
} {
  const modeReason = input.dataConflict ? 'DATA_CONFLICT' : 'NO_VALIDATED_RECOMMENDATION';
  const observation = input.dataConflict
    ? '页面时间事实与推荐表述不一致，暂不给出方案推荐。'
    : '当前冲突仍未找到可验证的修复方案。';

  return {
    mode: 'ATTENTION',
    priority: 'P1',
    insightType: input.dataConflict ? 'DATA_UNCERTAINTY' : 'EXPLANATION',
    title: input.dataConflict ? '数据不一致' : '暂无已验证方案',
    observationSummary: observation,
    explanationSummary: input.conflictSummary?.trim() || observation,
    impacts: [],
    recommendation: undefined,
    actions: [
      {
        kind: 'PREVIEW',
        label: '查看方案影响',
        actionType: 'COMPARE_OPTIONS',
        payloadRef: `decision-problem:${input.focusedProblemId}`,
      },
    ],
    confidence: 1,
    evidenceRefs: [],
    factRefs: [
      `decision-problem:${input.focusedProblemId}`,
      `gate:${modeReason}`,
    ],
    focusedProblemId: input.focusedProblemId,
    modeReason,
  };
}

/** Rule advisor when a validated option exists. */
export function buildGenericConflictAdvisorCopy(input: {
  conflictCause: string;
  optionTitle: string;
  rationale?: string;
}): { title: string; body: string; advice: string } {
  const body = clamp55(input.conflictCause);
  const advice = clamp55(
    input.rationale?.trim() ||
      `采用「${input.optionTitle}」，对后续安排影响较小。`,
  );
  return {
    title: '冲突修复建议',
    body,
    advice,
  };
}

function clamp55(text: string): string {
  const chars = [...(text ?? '').trim()];
  if (chars.length <= 55) return chars.join('');
  return chars.slice(0, 55).join('');
}

/**
 * Map Gateway unified preview → recommend gate preview.
 * Conservative: unresolved if action not allowed or repair still blocking.
 */
export function toRecommendGatePreview(input: {
  problemId: string;
  planVersion?: string | null;
  preview: {
    problemId: string;
    actionId: string;
    action?: { allowed?: boolean; title?: string };
    repairPreview?: Record<string, unknown> | null;
    predictedImpact?: unknown;
  };
}): RecommendGatePreview {
  const remaining = extractRemainingBlocking(input.preview.repairPreview);
  const resolved =
    input.preview.action?.allowed !== false && remaining.length === 0;
  return {
    problemId: input.preview.problemId || input.problemId,
    optionId: input.preview.actionId,
    resolved,
    remainingBlockingIssues: remaining,
    planVersion: input.planVersion ?? null,
    claimedLabels: [
      input.preview.action?.title,
      ...extractLabelsFromUnknown(input.preview.predictedImpact),
      ...extractLabelsFromUnknown(input.preview.repairPreview),
    ].filter(Boolean) as string[],
  };
}

function extractRemainingBlocking(repair?: Record<string, unknown> | null): string[] {
  if (!repair || typeof repair !== 'object') return [];
  const candidates = [
    repair.remainingBlockingIssues,
    repair.blockingIssues,
    repair.unresolvedIssues,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) {
      return c.map((x) => String(x)).filter(Boolean);
    }
  }
  if (repair.feasible === false || repair.resolved === false) {
    return ['PREVIEW_NOT_FEASIBLE'];
  }
  return [];
}

function extractLabelsFromUnknown(v: unknown): string[] {
  if (v == null) return [];
  if (typeof v === 'string') return [v];
  try {
    return [JSON.stringify(v)].filter((s) => s.length < 200);
  } catch {
    return [];
  }
}

export function isGenericScheduleConflictProblem(input: {
  problemId?: string;
  semanticKey?: string | null;
  type?: string | null;
  title?: string | null;
  hasDecisionCase?: boolean;
}): boolean {
  if (input.hasDecisionCase) return false;
  const blob = [
    input.problemId,
    input.semanticKey,
    input.type,
    input.title,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return (
    /lunch|午餐|time_conflict|schedule|same_day|meal|时间冲突|时间窗/.test(blob) ||
    input.type === 'TIME_CONFLICT'
  );
}
