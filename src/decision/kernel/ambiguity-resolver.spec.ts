import { DecisionAmbiguityResolver } from './ambiguity-resolver';

describe('ambiguity-resolver', () => {
  it('calculates higher gap for strong, aligned signals', () => {
    const r = new DecisionAmbiguityResolver();
    const rep = r.calculateAmbiguity([
      { edgeId: 'e1', factor: 'water_crossing', direction: 'INCREASE', strength01: 1, reason: 'x' },
      { edgeId: 'e2', factor: 'terrain', direction: 'INCREASE', strength01: 0.8, reason: 'y' },
    ] as any);
    expect(rep.gap01).toBeGreaterThan(0.4);
    expect(rep.isRobustMode).toBe(true);
  });

  it('triggers emergency gap when 3+ unique users report INCREASE within 6h for same contextKey', () => {
    const r = new DecisionAmbiguityResolver();
    const now = new Date().toISOString();
    const rep = r.calculateAmbiguity(
      [
        { edgeId: 'e1', factor: 'water_crossing', direction: 'INCREASE', strength01: 0.2, reason: 'x', at: now, userId: 'u1', contextKey: 'IS:4:SUV' },
        { edgeId: 'e2', factor: 'terrain', direction: 'INCREASE', strength01: 0.2, reason: 'y', at: now, userId: 'u2', contextKey: 'IS:4:SUV' },
        { edgeId: 'e3', factor: 'global', direction: 'INCREASE', strength01: 0.2, reason: 'z', at: now, userId: 'u3', contextKey: 'IS:4:SUV' },
      ] as any,
      { contextKey: 'IS:4:SUV', consensusWindowHours: 6, consensusMinUsers: 3 },
    );
    expect(rep.gap01).toBe(1);
    expect(rep.isEmergency).toBe(true);
    expect(rep.reason).toMatch(/\[紧急\]/);
  });

  it('reweights scenarios towards higher risk when gap>0', () => {
    const r = new DecisionAmbiguityResolver();
    const per = [
      { sampleId: 'a', weight: 0.5, feasible: true, riskCost: 1 },
      { sampleId: 'b', weight: 0.5, feasible: true, riskCost: 10 },
    ] as any;
    const w0 = r.reweightScenarios(per, 0);
    const w1 = r.reweightScenarios(per, 0.8);
    expect(w0[0]).toBeCloseTo(0.5, 6);
    expect(w1[1]).toBeGreaterThan(w1[0]);
  });
});

