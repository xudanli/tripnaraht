import { MetaPolicyService } from '../optimization/meta/meta-policy.service';
import { ExperienceRoutingPolicyService } from './experience-routing-policy.service';
import { EXPERIENCE_FLOW_SCHEMA_V1 } from '../models/experience-flow.model';

describe('ExperienceRoutingPolicyService', () => {
  const meta = new MetaPolicyService();
  const policy = new ExperienceRoutingPolicyService(meta);

  const stormFlow = {
    schemaVersion: EXPERIENCE_FLOW_SCHEMA_V1,
    tempo: 'EMPATHY_RECOVERY' as const,
    heterogeneityIndex: 0.35,
    surpriseBuffer: 0.05,
    currentFrictionCapacity: 0.2,
    narrativeTone: 'empathetic_reassurance',
  };

  it('getDynamicWeights returns w2=1.35 and low beta for empathy recovery', () => {
    const w = policy.getDynamicWeights(stormFlow, 'EMPATHY_RECOVERY');
    expect(w.w2).toBe(1.35);
    expect(w.beta).toBeLessThanOrEqual(0.03);
  });

  it('computeGeneralizedEdgeCost penalizes friction more than IG reward under storm', () => {
    const highFriction = policy.computeGeneralizedEdgeCost(
      { physicalTimeMs: 30 * 60_000, frictionScore: 0.9, informationGain: 0.8 },
      stormFlow,
      'EMPATHY_RECOVERY',
    );
    const lowFriction = policy.computeGeneralizedEdgeCost(
      { physicalTimeMs: 30 * 60_000, frictionScore: 0.1, informationGain: 0.2 },
      stormFlow,
      'EMPATHY_RECOVERY',
    );
    expect(highFriction).toBeGreaterThan(lowFriction);
  });
});
