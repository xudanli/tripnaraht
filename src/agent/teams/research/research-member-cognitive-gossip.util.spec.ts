import { shouldApplyExperienceGossip } from './research-member-cognitive-gossip.util';
import type { UserCognitiveProfile } from '../../memory/experience-replay/user-cognitive-profile.types';

function profile(axis: number, neg: number): UserCognitiveProfile {
  return {
    schema_version: 1,
    subject_ref: 'u',
    updated_at: '2026-01-01T00:00:00.000Z',
    evidence_weight: 1,
    compliance_experience_axis: axis,
    price_sensitivity_proxy: 0,
    stitch_transparency_exposure_proxy: 0,
    negative_feedback_proxy: neg,
    derivation: {
      narrate_compliance_first_hits: 0,
      narrate_commerce_over_experience_hits: 0,
      narrate_stitch_transparency_voice_hits: 0,
      mean_conflict_count_when_nonzero: null,
      memory_replay_axis_narrate_hits: 0,
      memory_replay_penalized_hits: 0,
    },
  };
}

describe('shouldApplyExperienceGossip', () => {
  it('无档案为 false', () => {
    expect(shouldApplyExperienceGossip(undefined)).toBe(false);
  });

  it('体验轴足够负且负反馈代理低为 true', () => {
    expect(shouldApplyExperienceGossip(profile(-0.5, 0))).toBe(true);
  });

  it('负反馈代理高时熔断', () => {
    expect(shouldApplyExperienceGossip(profile(-0.9, 0.6))).toBe(false);
  });

  it('轴未达体验阈值为 false', () => {
    expect(shouldApplyExperienceGossip(profile(0, 0))).toBe(false);
  });
});
