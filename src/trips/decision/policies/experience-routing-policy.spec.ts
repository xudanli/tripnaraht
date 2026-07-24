import {
  computeGeneralizedEdgeCost,
  frictionPenaltyMultiplier,
  resolveExperienceRoutingWeights,
  resolveExplorationBetaFromExperienceFlow,
} from './experience-routing-policy';
import { projectExperienceFlowFromTraceSignals } from '../models/experience-flow.model';

describe('ExperienceRoutingPolicy', () => {
  const stormFlow = projectExperienceFlowFromTraceSignals({
    narrative_track: 'EMPATHY_RECOVERY',
    frustration_circuit_triggered: true,
    stability_mode_active: true,
  });

  const recoveryFlow = projectExperienceFlowFromTraceSignals({
    narrative_track: 'EXPERIENCE_FIRST',
    frustration_circuit_triggered: false,
    stability_mode_active: false,
  });

  it('EMPATHY_RECOVERY maximizes friction weight over exploration', () => {
    const w = resolveExperienceRoutingWeights({ experienceFlow: stormFlow });
    expect(w.wFriction).toBeGreaterThan(w.betaInformationGain * 10);
    expect(w.betaInformationGain).toBeLessThan(0.05);
  });

  it('EXPLORATION mode increases beta vs DEFAULT', () => {
    const explore = resolveExperienceRoutingWeights({
      experienceFlow: recoveryFlow,
      mode: 'EXPLORATION',
    });
    const runtime = resolveExperienceRoutingWeights({
      experienceFlow: recoveryFlow,
      mode: 'RUNTIME',
    });
    expect(explore.betaInformationGain).toBeGreaterThan(runtime.betaInformationGain);
  });

  it('computeGeneralizedEdgeCost: high friction increases cost; IG decreases it', () => {
    const weights = resolveExperienceRoutingWeights({ experienceFlow: recoveryFlow });
    const lowFriction = computeGeneralizedEdgeCost(
      { physicalTimeMin: 60, frictionScore: 0.1, informationGain: 0 },
      weights,
    );
    const highFriction = computeGeneralizedEdgeCost(
      { physicalTimeMin: 60, frictionScore: 0.9, informationGain: 0 },
      weights,
    );
    const withIg = computeGeneralizedEdgeCost(
      { physicalTimeMin: 60, frictionScore: 0.5, informationGain: 0.8 },
      weights,
    );
    expect(highFriction).toBeGreaterThan(lowFriction);
    expect(withIg).toBeLessThan(
      computeGeneralizedEdgeCost(
        { physicalTimeMin: 60, frictionScore: 0.5, informationGain: 0 },
        weights,
      ),
    );
  });

  it('resolveExplorationBetaFromExperienceFlow aligns with routing weights', () => {
    const beta = resolveExplorationBetaFromExperienceFlow(recoveryFlow, 'EXPLORATION');
    const weights = resolveExperienceRoutingWeights({
      experienceFlow: recoveryFlow,
      mode: 'EXPLORATION',
    });
    expect(beta).toBe(weights.betaInformationGain);
  });

  it('frictionPenaltyMultiplier rises as capacity drops', () => {
    expect(frictionPenaltyMultiplier(stormFlow)).toBeGreaterThan(
      frictionPenaltyMultiplier(recoveryFlow),
    );
  });
});
