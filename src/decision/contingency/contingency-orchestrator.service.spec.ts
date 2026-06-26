import { ContingencyOrchestratorService } from './contingency-orchestrator.service';
import { DecisionOsSloService } from '../slo/decision-os-slo.service';

describe('ContingencyOrchestratorService', () => {
  it('routes KERNEL_REPLAN by default', async () => {
    const slo = new DecisionOsSloService();
    const orch = new ContingencyOrchestratorService(slo);
    const calls: string[] = [];
    orch.registerHandler({
      pathId: 'KERNEL_REPLAN',
      trigger: async (tripId, reason) => {
        calls.push(`${tripId}:${reason}`);
        return { outcome: 'SUCCESS' };
      },
    });

    await orch.triggerReplan('trip-1', 'flight_cancelled');
    expect(calls).toEqual(['trip-1:flight_cancelled']);
    expect(slo.getSnapshot().contingency.totalRuns).toBe(1);
  });

  it('resolvePath maps silent heal and in_trip reasons', () => {
    const orch = new ContingencyOrchestratorService();
    expect(orch.resolvePath('budget_drift_silent_heal')).toBe('SILENT_HEAL');
    expect(orch.resolvePath('in_trip:WEATHER_ALERT')).toBe('IN_TRIP_RECOVERY');
    expect(orch.resolvePath('plan_b_triggered')).toBe('ADVISOR_PLAN_B');
    expect(orch.resolvePath('weather_update')).toBe('KERNEL_REPLAN');
  });

  it('records PARTIAL outcome from handler', async () => {
    const slo = new DecisionOsSloService();
    const orch = new ContingencyOrchestratorService(slo);
    orch.registerHandler({
      pathId: 'ADVISOR_PLAN_B',
      trigger: async () => ({ outcome: 'PARTIAL', humanAssisted: true }),
    });
    const result = await orch.trigger({
      tripId: 't1',
      reason: 'plan_b_triggered',
      pathId: 'ADVISOR_PLAN_B',
    });
    expect(result.outcome).toBe('PARTIAL');
    expect(slo.getSnapshot().contingency.successRuns).toBe(1);
  });
});
