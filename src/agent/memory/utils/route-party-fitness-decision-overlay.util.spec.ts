import { createDefaultDecisionParams } from '../interfaces/decision-params.interface';
import { applyRoutePartyFitnessToDecisionParams } from './route-party-fitness-decision-overlay.util';

describe('applyRoutePartyFitnessToDecisionParams', () => {
  it('low tightens ascent buffer and sets avoidRapidAscent', () => {
    const p = createDefaultDecisionParams();
    p.constraints.maxDailyAscentM = 1200;
    applyRoutePartyFitnessToDecisionParams(p, 'low');
    expect(p.constraints.maxDailyAscentM).toBeLessThanOrEqual(480);
    expect(p.constraints.bufferTimeMin).toBeGreaterThanOrEqual(36);
    expect(p.constraints.avoidRapidAscent).toBe(true);
    expect(p.repairPolicy.preferRestDay).toBe(true);
  });

  it('medium caps daily ascent when already high', () => {
    const p = createDefaultDecisionParams();
    p.constraints.maxDailyAscentM = 1200;
    applyRoutePartyFitnessToDecisionParams(p, 'medium');
    expect(p.constraints.maxDailyAscentM).toBe(820);
    expect(p.constraints.bufferTimeMin).toBeGreaterThanOrEqual(24);
  });

  it('high bumps ascent only when base already permissive', () => {
    const p = createDefaultDecisionParams();
    p.constraints.maxDailyAscentM = 900;
    applyRoutePartyFitnessToDecisionParams(p, 'high');
    expect(p.constraints.maxDailyAscentM).toBe(990);
    expect(p.constraints.bufferTimeMin).toBe(10);
  });
});
