import type {
  ConversationActionV1,
  DecisionOptionItemV1,
  DecisionOptionsCardV1,
} from '../conversation-turn-result.types';

export type TradeoffAssembleSource = {
  cognition_cards?: {
    cards?: Array<{
      kind?: string;
      title_zh?: string;
      body_zh?: string;
      cta_zh?: string;
    }>;
    focused_problem?: { title_zh?: string; body_zh?: string };
    recommendation_zh?: string;
  } | null;
  negotiation_payload?: {
    hash?: string;
    alternatives?: Array<{
      id?: string;
      title?: string;
      title_zh?: string;
      summary?: string;
      summary_zh?: string;
      recommended?: boolean;
      feasibility?: string;
      message?: string;
      composer_message_zh?: string;
      dimensions?: DecisionOptionItemV1['dimensions'];
      blocking_reasons_zh?: string[];
      required_changes_zh?: string[];
    }>;
    recommendation_zh?: string;
    problem_zh?: string;
  } | null;
  requires_consent?: boolean;
  travel_decision_problem?: {
    decisionId?: string;
    decisionKey?: string;
    state?: string;
    subject?: { title_zh?: string; question_zh?: string; reason_zh?: string };
    recommendation?: { optionId?: string; reason_zh?: string };
    options?: Array<{
      optionId?: string;
      label_zh?: string;
      summary_zh?: string;
      recommended?: boolean;
      feasibility?: string;
      blockingReasons_zh?: string[];
      requiredChanges_zh?: string[];
      dimensions?: Array<{
        dimension?: string;
        level?: string;
        explanation?: string;
      }>;
    }>;
  } | null;
};

function dimsFromProblemOption(
  dims?: Array<{ dimension?: string; level?: string; explanation?: string }>,
): DecisionOptionItemV1['dimensions'] | undefined {
  if (!dims?.length) return undefined;
  const out: NonNullable<DecisionOptionItemV1['dimensions']> = {};
  for (const d of dims) {
    const label = [d.level, d.explanation].filter(Boolean).join(' · ');
    if (d.dimension === 'SAFETY') out.safety = label;
    if (d.dimension === 'TIME') out.time = label;
    if (d.dimension === 'COST') out.budget = label;
    if (d.dimension === 'FATIGUE') out.energy = label;
    if (d.dimension === 'EXPERIENCE') out.experience = label;
  }
  return Object.keys(out).length ? out : undefined;
}

function composerForOption(params: {
  label_zh: string;
  recommended?: boolean;
  explicit?: string;
}): string {
  if (params.explicit?.trim()) return params.explicit.trim();
  const label = params.label_zh.trim() || '该方案';
  return params.recommended ? `我选择（推荐）：${label}` : `我选择：${label}`;
}

/**
 * Tradeoff / cognition / negotiation / TravelDecisionProblem → decision_options 卡。
 */
export function adaptDecisionOptionsFromTradeoff(
  src: TradeoffAssembleSource,
): { card: DecisionOptionsCardV1; actions: ConversationActionV1[] } | null {
  const problem = src.travel_decision_problem;
  const neg = src.negotiation_payload;
  const options: DecisionOptionItemV1[] = [];

  if (problem?.options?.length) {
    for (const a of problem.options.slice(0, 5)) {
      const title = String(a.label_zh ?? `方案 ${options.length + 1}`);
      const composer = composerForOption({
        label_zh: title,
        recommended: a.recommended,
      });
      options.push({
        id: String(a.optionId ?? `opt_${options.length + 1}`),
        title_zh: title,
        summary_zh: a.summary_zh,
        recommended: a.recommended === true,
        composer_message_zh: composer,
        ...(a.feasibility ? { feasibility: a.feasibility } : {}),
        ...(a.blockingReasons_zh?.length
          ? { blocking_reasons_zh: a.blockingReasons_zh }
          : {}),
        ...(a.requiredChanges_zh?.length
          ? { required_changes_zh: a.requiredChanges_zh }
          : {}),
        ...(dimsFromProblemOption(a.dimensions)
          ? { dimensions: dimsFromProblemOption(a.dimensions) }
          : {}),
      });
    }
  } else if (neg?.alternatives?.length) {
    for (const a of neg.alternatives.slice(0, 5)) {
      const title = String(a.title_zh ?? a.title ?? `方案 ${options.length + 1}`);
      const composer = composerForOption({
        label_zh: title,
        recommended: a.recommended,
        explicit: a.composer_message_zh ?? a.message,
      });
      options.push({
        id: String(a.id ?? `opt_${options.length + 1}`),
        title_zh: title,
        summary_zh: a.summary_zh ?? a.summary,
        recommended: a.recommended === true,
        composer_message_zh: composer,
        ...(a.feasibility ? { feasibility: a.feasibility } : {}),
        ...(a.blocking_reasons_zh?.length
          ? { blocking_reasons_zh: a.blocking_reasons_zh }
          : {}),
        ...(a.required_changes_zh?.length
          ? { required_changes_zh: a.required_changes_zh }
          : {}),
        ...(a.dimensions ? { dimensions: a.dimensions } : {}),
      });
    }
  }

  const cog = src.cognition_cards;
  const problemZh =
    problem?.subject?.question_zh ??
    neg?.problem_zh ??
    cog?.focused_problem?.title_zh ??
    cog?.focused_problem?.body_zh ??
    undefined;
  const recommendation =
    problem?.recommendation?.reason_zh ??
    neg?.recommendation_zh ??
    cog?.recommendation_zh ??
    undefined;

  if (!options.length && cog?.cards?.length) {
    for (const c of cog.cards.slice(0, 3)) {
      if (!c.title_zh && !c.body_zh) continue;
      const title = String(c.title_zh ?? c.kind ?? `选项 ${options.length + 1}`);
      options.push({
        id: `cog_${options.length + 1}`,
        title_zh: title,
        summary_zh: c.body_zh,
        composer_message_zh: composerForOption({ label_zh: title }),
      });
    }
  }

  if (!options.length && !problemZh && !recommendation) return null;

  const decisionId = problem?.decisionId ?? neg?.hash;
  const requiresConsent =
    src.requires_consent === true ||
    Boolean(decisionId) ||
    Boolean(cog?.cards?.length);

  const card: DecisionOptionsCardV1 = {
    kind: 'decision_options',
    title_zh: problem?.subject?.title_zh ?? '方案对比',
    ...(problemZh ? { problem_zh: problemZh } : {}),
    ...(recommendation ? { recommendation_zh: recommendation } : {}),
    options: options.length
      ? options
      : [
          {
            id: 'default',
            title_zh: recommendation || '建议方案',
            summary_zh: problemZh,
            recommended: true,
            composer_message_zh: composerForOption({
              label_zh: recommendation || '建议方案',
              recommended: true,
            }),
          },
        ],
    requires_consent: requiresConsent,
    ...(decisionId ? { negotiation_hash: decisionId, decision_id: decisionId } : {}),
    ...(problem?.decisionKey ? { decision_key: problem.decisionKey } : {}),
    ...(problem?.state ? { decision_state: problem.state } : {}),
  };

  const actions: ConversationActionV1[] = [];
  if (decisionId && problem?.options?.length) {
    for (const o of problem.options) {
      if (o.feasibility === 'BLOCKED') continue;
      const title = String(o.label_zh ?? o.optionId);
      const composer = composerForOption({
        label_zh: title,
        recommended: o.recommended,
      });
      actions.push({
        id: `select_${o.optionId}`,
        kind: 'select_decision_option',
        label_zh: o.recommended ? `选择（推荐）${title}` : `选择${title}`,
        payload: {
          decision_id: decisionId,
          option_id: o.optionId,
          decision_key: problem.decisionKey,
          /** 兼容只认 route_and_run_message 的客户端：切勿改用 option_id 填输入框 */
          message: composer,
          composer_message_zh: composer,
        },
      });
      /** 双写：旧客户端把 actions 当 suggested_operations 时也能点中文指令 */
      actions.push({
        id: `select_msg_${o.optionId}`,
        kind: 'route_and_run_message',
        label_zh: o.recommended ? `选推荐：${title}` : `选择：${title}`,
        payload: {
          message: composer,
          decision_id: decisionId,
          option_id: o.optionId,
          decision_key: problem.decisionKey,
        },
      });
    }
  } else if (neg?.hash) {
    actions.push({
      id: 'confirm_negotiation',
      kind: 'confirm_negotiation',
      label_zh: '确认方案',
      payload: { negotiation_hash: neg.hash },
    });
  } else if (requiresConsent) {
    actions.push({
      id: 'decision_consent',
      kind: 'decision_consent',
      label_zh: '授权继续',
      payload: { decision_consent: true },
    });
  }

  return { card, actions };
}
