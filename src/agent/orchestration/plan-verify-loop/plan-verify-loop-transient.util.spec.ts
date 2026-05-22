import {
  consumeGraphStep,
  createPlanVerifyTransientState,
  isRepairBudgetExceeded,
  parsePlanVerifyLoopBudgetConfig,
  syncRepairsRemainingFromDso,
} from './plan-verify-loop-transient.util';

describe('plan-verify-loop-transient.util', () => {
  it('consumeGraphStep allows exactly maxGraphSteps node runs', () => {
    const config = parsePlanVerifyLoopBudgetConfig();
    let loop = createPlanVerifyTransientState(undefined, { ...config, maxGraphSteps: 3 });
    for (let i = 0; i < 3; i++) {
      const tick = consumeGraphStep(loop);
      expect(tick.exhausted).toBe(false);
      loop = tick.loop;
    }
    const final = consumeGraphStep(loop);
    expect(final.exhausted).toBe(true);
  });

  it('syncRepairsRemainingFromDso reflects DSO.repairCount', () => {
    const loop = createPlanVerifyTransientState({ systemState: { repairCount: 2 } } as any, {
      maxGraphSteps: 8,
      maxRepairs: 3,
      maxUtilityDeclines: 2,
    });
    const synced = syncRepairsRemainingFromDso(loop, { systemState: { repairCount: 3 } } as any);
    expect(synced.repairsRemaining).toBe(0);
    expect(isRepairBudgetExceeded(synced, { systemState: { repairCount: 3 } } as any)).toBe(true);
  });
});
