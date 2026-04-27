import type { CasePrecedent } from './case-record.types';

export type RelaxationActionId =
  | 'upgrade_vehicle_to_4wd'
  | 'increase_days_by_1'
  | 'drop_one_must_include_poi'
  | 'proceed_at_own_risk'
  | 'accept_no_solution'
  | 'manual_relax_constraints';

export interface ConstraintScorerContext {
  /** e.g. REACHABILITY_HARD / budget.overrun / terrain.f_road_compatibility */
  dominant_cid?: string;
  /** Whether the dominant constraint is HARD (admissibility-style). */
  is_hard?: boolean;
  /** Oscillation counter (higher => raise regret penalty weight). */
  oscillation_k?: number;
  /** Precedent stats (top hit). */
  precedent?: CasePrecedent;
  /** Optional domain tags to choose preset (e.g. 'ICELAND'). */
  preset?: 'ICELAND_HARD' | 'SOFT_PREFERENCE';
  /** Persuasion efficiency stats (conversion learning). */
  persuasion?: { rate?: number; shown_count?: number; chosen_top_count?: number };
  /** Weight of persuasion term (delta). */
  delta?: number;
}

export interface ScoreBreakdown {
  score: number;
  weights: { alpha: number; beta: number; gamma: number; delta: number };
  terms: { authority: number; regret: number; cost: number; persuasion: number; gN: number; N: number };
  dominant_cid?: string;
  precedent_n: number;
}

export class ConstraintScorer {
  /**
   * Default presets:
   * - ICELAND_HARD: alpha:gamma:beta = 6:4:1 (hard physics first)
   * - SOFT_PREFERENCE: alpha:gamma:beta = 4:3:2
   */
  static calculateScore(action: RelaxationActionId, ctx: ConstraintScorerContext): ScoreBreakdown {
    const preset = ctx.preset ?? (ctx.is_hard ? 'ICELAND_HARD' : 'SOFT_PREFERENCE');
    const base =
      preset === 'ICELAND_HARD'
        ? { alpha: 6, gamma: 4, beta: 1 }
        : { alpha: 4, gamma: 3, beta: 2 };

    const k = Math.max(0, Math.floor(ctx.oscillation_k ?? 0));
    const gamma = base.gamma * (1 + 0.5 * Math.max(0, k - 1)); // k>1 starts amplifying
    let alpha = base.alpha;
    let beta = base.beta;

    const N =
      typeof ctx.precedent?.sample_count === 'number'
        ? ctx.precedent.sample_count
        : (() => {
            const m = String(ctx.precedent?.summary ?? '').match(/N\\s*=\\s*(\\d+)/i);
            return m ? parseInt(m[1], 10) : 0;
          })();
    const gN = ConstraintScorer.sampleWeight(N);

    const lateAcceptRate =
      typeof ctx.precedent?.stats?.historical_late_accept_rate === 'number'
        ? ctx.precedent.stats.historical_late_accept_rate
        : undefined;
    const authority = (Number.isFinite(lateAcceptRate) ? (lateAcceptRate as number) : 0) * gN;

    const wallMs =
      typeof ctx.precedent?.stats?.wall_hit_distance_p90_latency_ms === 'number'
        ? ctx.precedent.stats.wall_hit_distance_p90_latency_ms
        : undefined;
    const regret = ConstraintScorer.normalizeLatencyMs(wallMs);

    const cost = ConstraintScorer.actionCost(action);

    let delta = typeof ctx.delta === 'number' && Number.isFinite(ctx.delta) ? ctx.delta : 1.5;
    const persuasion =
      typeof ctx.persuasion?.rate === 'number' && Number.isFinite(ctx.persuasion.rate)
        ? Math.max(0, Math.min(1, ctx.persuasion.rate))
        : 0;

    // Cold start: damp delta when sample is tiny.
    const shown = typeof ctx.persuasion?.shown_count === 'number' ? ctx.persuasion.shown_count : 0;
    if (shown > 0 && shown < 3) delta *= 0.5;

    // HARD admissibility anchoring: if the action addresses the dominant hard cid, amplify alpha and discount beta.
    const hard = ctx.is_hard === true || /HARD|ADMISS|REACHABILITY/i.test(String(ctx.dominant_cid ?? ''));
    const addressesHard = hard && action === 'upgrade_vehicle_to_4wd';
    if (addressesHard) {
      alpha *= 1.8;
      beta *= 0.7;
    }

    // Score: alpha*authority + gamma*regret - beta*cost + delta*persuasion
    const score = alpha * authority + gamma * regret - beta * cost + delta * persuasion;
    return {
      score,
      weights: { alpha, beta, gamma, delta },
      terms: { authority, regret, cost, persuasion, gN, N },
      ...(ctx.dominant_cid ? { dominant_cid: ctx.dominant_cid } : {}),
      precedent_n: N,
    };
  }

  static sampleWeight(N: number): number {
    const n = Math.max(0, Math.floor(N));
    // min(1, log1p(N)/log1p(10)) dampens small sample overconfidence
    const denom = Math.log1p(10);
    const v = denom > 0 ? Math.log1p(n) / denom : 0;
    return Math.max(0, Math.min(1, v));
  }

  static normalizeLatencyMs(ms: number | undefined): number {
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return 0;
    // 3 minutes ~ 180000ms as a typical "wall" scale; clamp to [0,1.5]
    return Math.max(0, Math.min(1.5, ms / 180_000));
  }

  static actionCost(action: RelaxationActionId): number {
    // Heuristic “user cost” in [0,1]: higher => more painful
    switch (action) {
      case 'upgrade_vehicle_to_4wd':
        return 0.8; // money + availability
      case 'increase_days_by_1':
        return 0.6; // time + accommodation
      case 'drop_one_must_include_poi':
        return 0.4; // value loss
      case 'accept_no_solution':
        return 0.9; // stop
      case 'manual_relax_constraints':
        return 0.5; // effort / ambiguity
      case 'proceed_at_own_risk':
        return 0.2; // time risk (handled via regret), but low immediate pain
      default:
        return 0.5;
    }
  }
}

