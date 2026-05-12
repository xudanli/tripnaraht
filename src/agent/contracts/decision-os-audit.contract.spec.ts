import { normalizeDecisionOsAuditContract } from './decision-os-audit.contract';

describe('normalizeDecisionOsAuditContract', () => {
  it('fills required fields and reports violations for missing payload', () => {
    const out = normalizeDecisionOsAuditContract(undefined);
    expect(out.dominant_cid).toBe('unknown.unattributed');
    expect(out.session_consistency_score).toBe(0);
    expect(out.delta_reason).toBe('unknown');
    expect(out.delta_utility).toBe(0);
    expect(out.violations.length).toBeGreaterThan(0);
  });

  it('keeps valid payload unchanged with zero violations', () => {
    const out = normalizeDecisionOsAuditContract({
      dominant_cid: 'terrain.f_road_compatibility',
      session_consistency_score: 97,
      predictive_feedback_then_repair: {
        intent_revision_flag: true,
        drift_vector: {
          delta_reason: 'aligned',
          delta_utility: 0,
        },
      },
    });
    expect(out.dominant_cid).toBe('terrain.f_road_compatibility');
    expect(out.session_consistency_score).toBe(97);
    expect(out.delta_reason).toBe('aligned');
    expect(out.delta_utility).toBe(0);
    expect(out.intent_revision_flag).toBe(true);
    expect(out.violations).toEqual([]);
  });
});
