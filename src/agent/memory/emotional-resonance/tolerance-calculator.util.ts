import type { UserCognitiveProfile } from '../experience-replay/user-cognitive-profile.types';
import type { AccumulatedResearchFinancialReport } from '../../teams/research/research-team-budget-ledger.util';
import { FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD } from './emotional-resonance.constants';
import type { MentalOffsetHints, UserEmotionalAccount } from './user-emotional-account.types';
import { computeRerollFrustrationBump } from './research-realtime-frustration.util';

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * 挫败感代理（与 `UserEmotionalAccount.frustration_score` 一致）。
 * 6.3：`realtimeRerollCount` 与 4.0 历史信号相加后再 clamp。
 */
export function computeFrustrationScoreFromProfile(
  profile: UserCognitiveProfile | undefined,
  realtimeRerollCount?: number,
): number {
  const history = profile
    ? clamp01(
        profile.negative_feedback_proxy * 0.85 + Math.max(0, profile.compliance_experience_axis) * 0.12,
      )
    : 0;
  const bump = computeRerollFrustrationBump(realtimeRerollCount ?? 0);
  return clamp01(history + bump);
}

const BETA = 0.35;
const ALPHA = 1.15;

type DtiParts = Readonly<{
  base_tolerance: number;
  savings_term: number;
  /** 未乘 β 的安全/挫败代理项（与 `BETA * safety_penalty` 一并构成减项） */
  safety_penalty: number;
  experience_bias_term: number;
  tolerance_bonus: number;
}>;

function computeDtiParts(
  profile: UserCognitiveProfile | undefined,
  financials: AccumulatedResearchFinancialReport | undefined,
  tripTotalBudget: number | undefined,
): DtiParts | null {
  if (profile === undefined && financials === undefined) return null;

  const ps = profile?.price_sensitivity_proxy ?? 0.45;
  const axis = profile?.compliance_experience_axis ?? 0;
  const neg = profile?.negative_feedback_proxy ?? 0;

  const baseTolerance = 0.2 + 0.1 * (1 - ps);

  const totalB = tripTotalBudget ?? financials?.total_user_budget ?? 0;
  const savings = financials?.budget_aggregate_savings ?? 0;
  const savingsRatio = totalB > 0 && savings > 0 ? savings / totalB : 0;
  const savingsTerm = Math.min(0.42, savingsRatio * ALPHA * (0.35 + ps));

  const safetyPenalty = Math.min(
    0.38,
    Math.max(0, axis) * 0.14 + neg * 0.22 + (profile?.stitch_transparency_exposure_proxy ?? 0) * 0.08,
  );

  const gamma = 0.06;
  const experienceBiasTerm = Math.max(-0.04, Math.min(0.06, -axis * gamma));

  const raw = baseTolerance + savingsTerm - BETA * safetyPenalty + experienceBiasTerm;
  const tolerance_bonus = clamp01(raw);

  return {
    base_tolerance: baseTolerance,
    savings_term: savingsTerm,
    safety_penalty: safetyPenalty,
    experience_bias_term: experienceBiasTerm,
    tolerance_bonus,
  };
}

/**
 * 6.0 DTI-lite：容忍度溢价（仅舒适度/便捷度叙事域；安全/合规通过惩罚项压增益，不形成「省钱换安全」）。
 *
 * `tolerance_bonus ≈ Base + α·Δsavings − β·Δsafety_proxy + γ·experience_bias`
 */
export function calculateToleranceBonus(
  profile: UserCognitiveProfile | undefined,
  financials: AccumulatedResearchFinancialReport | undefined,
  tripTotalBudget: number | undefined,
): number {
  return computeDtiParts(profile, financials, tripTotalBudget)?.tolerance_bonus ?? 0;
}

export function buildUserEmotionalAccountSnapshot(
  profile: UserCognitiveProfile | undefined,
  financials: AccumulatedResearchFinancialReport | undefined,
  tripTotalBudget: number | undefined,
  realtimeRerollCount?: number,
): UserEmotionalAccount {
  const parts = computeDtiParts(profile, financials, tripTotalBudget);
  const frustration = computeFrustrationScoreFromProfile(profile, realtimeRerollCount);

  if (!parts) {
    if (frustration === 0) {
      return {
        accumulated_goodwill: 0,
        current_tolerance_bonus: 0,
        frustration_score: 0,
      };
    }
    return {
      accumulated_goodwill: 0,
      current_tolerance_bonus: 0,
      frustration_score: frustration,
    };
  }

  const totalB = tripTotalBudget ?? financials?.total_user_budget ?? 0;
  const savings = financials?.budget_aggregate_savings ?? 0;
  const savingsRatio = totalB > 0 && savings > 0 ? savings / totalB : 0;
  const goodwill = clamp01(savingsRatio * 2.2 + (savings > 0 ? 0.08 : 0));

  return {
    accumulated_goodwill: goodwill,
    current_tolerance_bonus: parts.tolerance_bonus,
    frustration_score: frustration,
  };
}

/**
 * 心理抵扣建议：`suture_aggressive_allowed` 仅在节省显著、价格敏感、挫败感可控且容忍溢价足够时置 true（需有 4.0 profile）。
 */
export function calculateMentalOffsetHints(
  profile: UserCognitiveProfile | undefined,
  financials: AccumulatedResearchFinancialReport | undefined,
  tripTotalBudget: number | undefined,
  realtimeRerollCount?: number,
): MentalOffsetHints {
  const parts = computeDtiParts(profile, financials, tripTotalBudget);
  const rr = Math.max(0, Math.floor(realtimeRerollCount ?? 0));
  const frustration_score = computeFrustrationScoreFromProfile(profile, rr);
  /** 第二次重跑起关闭激进缝合与 Loss-Gain（与数值熔断并列） */
  const reroll_suppression = rr >= 2;
  const frustration_circuit_active =
    frustration_score >= FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD || reroll_suppression;

  if (!parts) {
    return {
      suture_aggressive_allowed: false,
      tolerance_bonus: 0,
      ...(frustration_circuit_active ? { frustration_circuit_active: true } : {}),
      ...(rr > 0 ? { realtime_reroll_count: rr } : {}),
    };
  }

  const totalB = tripTotalBudget ?? financials?.total_user_budget ?? 0;
  const savings = financials?.budget_aggregate_savings ?? 0;
  const savingsRatio = totalB > 0 ? savings / totalB : 0;
  const ps = profile?.price_sensitivity_proxy ?? 0;
  const neg = profile?.negative_feedback_proxy ?? 0;
  const axis = profile?.compliance_experience_axis ?? 0;

  const suture_aggressive_allowed =
    !frustration_circuit_active &&
    profile !== undefined &&
    savingsRatio >= 0.15 &&
    ps >= 0.45 &&
    neg < 0.55 &&
    parts.tolerance_bonus >= 0.28 &&
    axis < 0.55;

  return {
    suture_aggressive_allowed,
    tolerance_bonus: parts.tolerance_bonus,
    ...(frustration_circuit_active ? { frustration_circuit_active: true } : {}),
    ...(rr > 0 ? { realtime_reroll_count: rr } : {}),
    dti_components: {
      base_tolerance: parts.base_tolerance,
      savings_term: parts.savings_term,
      safety_penalty: parts.safety_penalty,
      experience_bias_term: parts.experience_bias_term,
    },
  };
}
