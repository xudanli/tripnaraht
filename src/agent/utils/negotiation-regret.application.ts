import { NEGOTIATION_REASONING_TAG } from '../constants/negotiation-reasoning.constants';

/** Reads which alternative id was “undone” by the latest physical rollback. */
export type NegotiationRegretReader = {
  getAlternativeIdSupersededByLatestRollback(tripId: string): Promise<string | null>;
};

/** Additive regret penalty (stacks with fragility + global preference effort). */
export const REGRET_EFFORT_DELTA = 0.5;

function addRegretEffort(a: any): number {
  const base = typeof a?.effort_delta === 'number' && Number.isFinite(a.effort_delta) ? a.effort_delta : 0;
  return base + REGRET_EFFORT_DELTA;
}

function mergeReasoningTag(a: any, tag: string): string[] {
  const cur = Array.isArray(a?.reasoning_tags) ? [...a.reasoning_tags] : [];
  if (!cur.includes(tag)) cur.push(tag);
  return cur.sort();
}

/**
 * Soft constraint after regret: mark the rolled-back alternative, sort it last, penalize effort_delta,
 * and avoid suggesting it as default when a viable sibling exists (unless only drive is unaffordable vs POSTPONE).
 */
export async function applyNegotiationRegretFromRollbackHistory(params: {
  tripId: string | undefined;
  regret: NegotiationRegretReader | undefined;
  alternatives: any[];
  default_option_id: string;
  driveTooExpensive: boolean;
}): Promise<{ alternatives: any[]; default_option_id: string }> {
  const tid = params.tripId != null ? String(params.tripId).trim() : '';
  if (!tid || !params.regret) {
    return { alternatives: params.alternatives, default_option_id: params.default_option_id };
  }
  const regretted = await params.regret.getAlternativeIdSupersededByLatestRollback(tid);
  if (!regretted || !params.alternatives?.length) {
    return { alternatives: params.alternatives, default_option_id: params.default_option_id };
  }

  const marked = params.alternatives.map((a) =>
    String(a?.id ?? '') === regretted
      ? {
          ...a,
          previously_rejected: true,
          prior_rollback_of_same_alternative: true,
          regret_notice: '该方案近期曾被物理回滚（反悔记忆），系统已显著降低推荐权重。',
          effort_delta: addRegretEffort(a),
          reasoning_tags: mergeReasoningTag(a, NEGOTIATION_REASONING_TAG.ROLLBACK_MEMORY),
        }
      : a,
  );

  const nonRej = marked.filter((x) => String(x?.id ?? '') !== regretted);
  const rej = marked.filter((x) => String(x?.id ?? '') === regretted);
  const reordered = [...nonRej, ...rej];

  let def = params.default_option_id;
  if (String(def) === regretted) {
    const other = params.alternatives.find((x) => String(x?.id ?? '') !== regretted);
    if (other) {
      if (
        regretted === 'POSTPONE_SCHEDULE' &&
        params.driveTooExpensive &&
        String(other.id) === 'UPGRADE_TO_DRIVE'
      ) {
        def = 'POSTPONE_SCHEDULE';
      } else {
        def = String(other.id);
      }
    }
  } else if (regretted === 'POSTPONE_SCHEDULE' && !params.driveTooExpensive) {
    def = 'UPGRADE_TO_DRIVE';
  }

  return { alternatives: reordered.length ? reordered : marked, default_option_id: def };
}
