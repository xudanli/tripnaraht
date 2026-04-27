import { IntakeCompilerService } from './intake-compiler.service';

describe('IntakeCompilerService', () => {
  it('should emit SimulatedRepairTrace for fatigue_high_risk (no string-only diagnostics)', () => {
    const svc = new IntakeCompilerService();
    const out = svc.compile({
      tripPlanRequest: {
        request_id: 'r1',
        origin: 'Reykjavik',
        destination: 'Iceland Ring Road',
        days: 3,
        party: { count: 2, has_elderly: true },
        message: '我想冰岛环岛三天，带老人',
      } as any,
    });
    expect(out.status).toBe('SUCCESS');
    expect(out.simulation?.simulatedRepairTraces?.length).toBeGreaterThan(0);
    const t = out.simulation!.simulatedRepairTraces.find((x) => x.simulation.boundary_id === 'fatigue_high_risk');
    expect(t?.reason).toBe('FATIGUE_EXHAUSTION');
    expect(t?.tacticId).toBe('IntakePredictiveSimulator');
  });

  it('should emit SimulatedRepairTrace for terrain_high_risk', () => {
    const svc = new IntakeCompilerService();
    const out = svc.compile({
      tripPlanRequest: {
        request_id: 'r1',
        origin: 'Reykjavik',
        destination: 'Iceland',
        days: 7,
        constraints: { vehicle_type: '2WD' },
        message: '想走冰岛高地 F-road',
      } as any,
    });
    expect(out.status).toBe('SUCCESS');
    const t = out.simulation?.simulatedRepairTraces.find((x) => x.simulation.boundary_id === 'terrain_high_risk');
    expect(t?.reason).toBe('HISTORICAL_BOUNDARY_HIT');
  });

  it('should emit UserDynamicBoundary when session has 2+ FATIGUE_EXHAUSTION repair traces', () => {
    const svc = new IntakeCompilerService();
    const session = [{ reason: 'FATIGUE_EXHAUSTION' }, { reason: 'FATIGUE_EXHAUSTION' }] as any;
    const out = svc.compile({
      tripPlanRequest: {
        request_id: 'r1',
        origin: 'Reykjavik',
        destination: 'Iceland',
        days: 7,
      } as any,
      sessionRepairTraces: session,
    });
    const u = out.simulation?.simulatedRepairTraces.find((x) => x.tacticId === 'UserDynamicBoundary');
    expect(u?.reason).toBe('FATIGUE_EXHAUSTION');
    expect(u?.evidence?.refIds?.[0]).toBe('SESSION_HISTORY:FATIGUE_EXHAUSTION_COUNT_2');
  });
});
