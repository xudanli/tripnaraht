import type { UserCognitiveProfile } from '../experience-replay/user-cognitive-profile.types';
import type { AccumulatedResearchFinancialReport } from '../../teams/research/research-team-budget-ledger.util';
import {
  buildUserEmotionalAccountSnapshot,
  calculateMentalOffsetHints,
  calculateToleranceBonus,
} from './tolerance-calculator.util';

function baseProfile(over: Partial<UserCognitiveProfile> = {}): UserCognitiveProfile {
  return {
    schema_version: 1,
    subject_ref: 't',
    updated_at: '2026-01-01T00:00:00.000Z',
    evidence_weight: 5,
    compliance_experience_axis: 0,
    price_sensitivity_proxy: 0.8,
    stitch_transparency_exposure_proxy: 0,
    negative_feedback_proxy: 0,
    derivation: {
      narrate_compliance_first_hits: 0,
      narrate_commerce_over_experience_hits: 0,
      narrate_stitch_transparency_voice_hits: 0,
      mean_conflict_count_when_nonzero: null,
      memory_replay_axis_narrate_hits: 0,
      memory_replay_penalized_hits: 0,
    },
    ...over,
  };
}

describe('tolerance-calculator.util (6.0)', () => {
  it('无 profile 且无 financials 时容忍度与心理账户为 0', () => {
    expect(calculateToleranceBonus(undefined, undefined, undefined)).toBe(0);
    const hints = calculateMentalOffsetHints(undefined, undefined, undefined);
    expect(hints.tolerance_bonus).toBe(0);
    expect(hints.suture_aggressive_allowed).toBe(false);
    expect(hints.dti_components).toBeUndefined();
    const acct = buildUserEmotionalAccountSnapshot(undefined, undefined, undefined);
    expect(acct).toEqual({
      accumulated_goodwill: 0,
      current_tolerance_bonus: 0,
      frustration_score: 0,
    });
  });

  it('高节省 + 高价格敏感 → 容忍溢价升高且可允许激进缝合', () => {
    const profile = baseProfile({ price_sensitivity_proxy: 0.85, compliance_experience_axis: 0.1 });
    const financials: AccumulatedResearchFinancialReport = {
      lines: [],
      total_estimated_cost: 8000,
      budget_aggregate_savings: 2000,
      total_user_budget: 10000,
    };
    const bonus = calculateToleranceBonus(profile, financials, 10000);
    expect(bonus).toBeGreaterThanOrEqual(0.28);
    const hints = calculateMentalOffsetHints(profile, financials, 10000);
    expect(hints.suture_aggressive_allowed).toBe(true);
    expect(hints.tolerance_bonus).toBe(bonus);
    expect(hints.dti_components?.savings_term).toBeGreaterThan(0);
  });

  it('合规轴过高时压制 suture_aggressive_allowed（防忽悠底线）', () => {
    const profile = baseProfile({
      price_sensitivity_proxy: 0.9,
      compliance_experience_axis: 0.7,
      negative_feedback_proxy: 0,
    });
    const financials: AccumulatedResearchFinancialReport = {
      lines: [],
      total_estimated_cost: 7000,
      budget_aggregate_savings: 3000,
      total_user_budget: 10000,
    };
    const hints = calculateMentalOffsetHints(profile, financials, 10000);
    expect(hints.suture_aggressive_allowed).toBe(false);
  });

  it('负反馈高时不允许激进缝合', () => {
    const profile = baseProfile({
      price_sensitivity_proxy: 0.9,
      negative_feedback_proxy: 0.6,
      compliance_experience_axis: 0,
    });
    const financials: AccumulatedResearchFinancialReport = {
      lines: [],
      total_estimated_cost: 7500,
      budget_aggregate_savings: 2500,
      total_user_budget: 10000,
    };
    const hints = calculateMentalOffsetHints(profile, financials, 10000);
    expect(hints.suture_aggressive_allowed).toBe(false);
  });

  it('挫败感熔断：frustration_score 超阈值时关闭激进缝合并打 frustration_circuit_active', () => {
    const profile = baseProfile({
      price_sensitivity_proxy: 0.85,
      negative_feedback_proxy: 0.54,
      compliance_experience_axis: 0.52,
    });
    const financials: AccumulatedResearchFinancialReport = {
      lines: [],
      total_estimated_cost: 8000,
      budget_aggregate_savings: 2000,
      total_user_budget: 10000,
    };
    const hints = calculateMentalOffsetHints(profile, financials, 10000);
    expect(hints.frustration_circuit_active).toBe(true);
    expect(hints.suture_aggressive_allowed).toBe(false);
  });

  it('实时重跑≥2：无 profile 也激活 frustration_circuit（关停激进缝合）', () => {
    const hints = calculateMentalOffsetHints(undefined, undefined, undefined, 2);
    expect(hints.frustration_circuit_active).toBe(true);
    expect(hints.suture_aggressive_allowed).toBe(false);
    expect(hints.realtime_reroll_count).toBe(2);
  });

  it('实时重跑 1 次：挫败分含 +0.05 bump', () => {
    const profile = baseProfile({ negative_feedback_proxy: 0, compliance_experience_axis: 0 });
    expect(calculateMentalOffsetHints(profile, undefined, undefined, 1).realtime_reroll_count).toBe(1);
    const acct = buildUserEmotionalAccountSnapshot(profile, undefined, undefined, 1);
    expect(acct.frustration_score).toBeCloseTo(0.05, 5);
  });
});
