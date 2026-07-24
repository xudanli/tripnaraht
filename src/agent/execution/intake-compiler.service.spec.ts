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
    expect(t?.reason).toBe('TERRAIN_F_ROAD_UNFIT');
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

  it('should HARD-block ring road 1-day lower bound for generic tourists', () => {
    const svc = new IntakeCompilerService();
    const out = svc.compile({
      tripPlanRequest: {
        request_id: 'r1',
        origin: 'Reykjavik',
        destination: 'Iceland Ring Road',
        days: 1,
        party: { count: 2 },
        message: '冰岛环岛自驾一天搞定',
      } as any,
    });
    expect(out.status).toBe('INTENT_COMPILE_ERROR');
    expect(out.marathon_lower_bound_deferred).toBeUndefined();
    const hard = out.diagnostics.find((d) => d.gap?.severity === 'HARD');
    expect(hard?.gap?.type).toBe('INTENT_COMPILE_ERROR');
    expect(hard?.message).toContain('L3-PROOF');
  });

  it('should defer marathon lower bound when bound trip has 7 days but NL says 24h ring road', () => {
    const svc = new IntakeCompilerService();
    const out = svc.compile({
      tripPlanRequest: {
        request_id: 'r1',
        origin: 'Reykjavik',
        destination: '冰岛',
        days: 7,
        party: { count: 2 },
        message: '6月5日想利用极昼，24小时不间断自驾环岛',
      } as any,
    });
    expect(out.status).toBe('SUCCESS');
    expect(out.marathon_lower_bound_deferred).toBe(true);
    expect(out.user_intent_anchors?.midnight_sun_continuous_drive).toBe(true);
    const soft = out.diagnostics.find((d) => d.gap?.severity === 'SOFT');
    expect(soft?.message).toContain('L3-DEFER');
    expect(soft?.message).toContain('1 天');
  });

  it('should defer HARD lower bound for midnight sun marathon and pass to runtime', () => {
    const svc = new IntakeCompilerService();
    const out = svc.compile({
      tripPlanRequest: {
        request_id: 'r1',
        origin: 'Reykjavik',
        destination: 'Iceland Ring Road',
        days: 1,
        party: { count: 2 },
        message: '想利用极昼，24小时不间断自驾环岛',
      } as any,
    });
    expect(out.status).toBe('SUCCESS');
    expect(out.marathon_lower_bound_deferred).toBe(true);
    expect(out.user_intent_anchors?.midnight_sun_continuous_drive).toBe(true);
    expect(out.suggested_days_for_deferred_lower_bound).toBeGreaterThanOrEqual(7);
    const hard = out.diagnostics.find((d) => d.gap?.severity === 'HARD');
    expect(hard).toBeUndefined();
    const soft = out.diagnostics.find((d) => d.gap?.severity === 'SOFT');
    expect(soft?.message).toContain('L3-DEFER');
    expect(soft?.message).toContain('midnight_sun_continuous_drive');
  });
});
