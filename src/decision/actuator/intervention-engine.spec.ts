import { InterventionEngine } from './intervention-engine';

describe('InterventionEngine', () => {
  it('triggers deterministic cut-off when ambiguity.isEmergency=true', async () => {
    const engine = new InterventionEngine();
    const out = await engine.checkAndIntervene(
      { at: new Date().toISOString(), lat: 0, lng: 0, delayMinutes: 0 },
      {
        aggregate: {
          n: 1,
          expectedRiskCost: 1,
          cvarRiskCost: 1,
          alpha: 0.95,
          beta: 0.5,
          objective: 1.5,
          infeasibleWeight: 0,
        },
        ambiguity: { gap01: 1, isRobustMode: true, isEmergency: true, reason: 'EMERGENCY' },
      },
    );
    expect(out.action).toBe('EMERGENCY_MELT_CUTOFF');
    expect(out.mode).toBe('EMERGENCY');
    expect(out.reasonCodes).toContain('CONSENSUS_EMERGENCY');
  });

  it('forces retreat mode when delay exceeds safety envelope threshold', async () => {
    const engine = new InterventionEngine();
    const out = await engine.checkAndIntervene(
      {
        at: new Date().toISOString(),
        lat: 10,
        lng: 10,
        delayMinutes: 35,
        nearbyShelters: [{ id: 's1', name: 'Shelter 1', lat: 10.001, lng: 10.001 }],
      },
      {
        aggregate: {
          n: 1,
          expectedRiskCost: 1,
          cvarRiskCost: 1,
          alpha: 0.95,
          beta: 0.5,
          objective: 1.5,
          infeasibleWeight: 0,
        },
        ambiguity: { gap01: 0, isRobustMode: false, isEmergency: false, reason: 'OK' },
      },
    );
    expect(out.action).toBe('FORCE_RETREAT_MODE');
    expect(out.mode).toBe('ADJUST');
    expect(out.highlightShelter?.id).toBe('s1');
  });
});

