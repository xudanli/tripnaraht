import { computePlanDraftFatigue } from './compute-plan-draft-fatigue.runner';
import type { ComputePlanDraftFatigueHost } from './compute-plan-draft-fatigue.host';

describe('compute-plan-draft-fatigue.runner', () => {
  it('returns undefined without calculator or days', () => {
    const host = {
      logger: { debug: jest.fn(), warn: jest.fn() },
      itineraryToTdfpmDayContexts: jest.fn(),
    } as unknown as ComputePlanDraftFatigueHost;
    expect(computePlanDraftFatigue(host, undefined)).toBeUndefined();
    expect(computePlanDraftFatigue(host, { days: [] } as any)).toBeUndefined();
  });

  it('normalizes max fatigue score to 0..1', () => {
    const host = {
      logger: { debug: jest.fn(), warn: jest.fn() },
      tdfpmCalculator: {
        computeFatigueScore: jest.fn(() => ({ fatigueScore: 50 })),
      },
      itineraryToTdfpmDayContexts: jest.fn(() => [{}, {}]),
    } as unknown as ComputePlanDraftFatigueHost;
    expect(computePlanDraftFatigue(host, { days: [{}] } as any)).toBe(0.5);
  });
});
