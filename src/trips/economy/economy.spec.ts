import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import {
  aggregateCostsFromDag,
  computeExecutionUtility,
  estimateValueFromDag,
  scoreDAGWithEconomy,
} from './index';

function sampleDag(): ExecutionTruthDAG {
  return {
    nodes: [
      {
        id: 'exec:a',
        date: '2026-06-01',
        slotId: 's',
        type: 'LEG',
        execution: {
          finalState: 'OK',
          delayMinutes: 60,
          reliabilityScore: 0.85,
        },
        temporal: {
          daylightViolation: false,
          crossDayRisk: 0.05,
          arrivalRisk: 0.12,
        },
        weather: { exposureScore: 0.15 },
        road: { accessibility: 1 },
      },
    ],
    edges: [],
  };
}

describe('economy (P16-B)', () => {
  it('computeExecutionUtility matches value/cost ratio', () => {
    const v = {
      auroraValue: 0.2,
      experienceValue: 0.7,
      stabilityValue: 0.9,
      completionValue: 1,
    };
    const c = {
      timeCost: 1,
      moneyCost: 1,
      energyCost: 0.5,
      riskCost: 0.3,
      opportunityCost: 0.2,
    };
    expect(computeExecutionUtility(v, c)).toBeCloseTo((0.2 + 0.7 + 0.9 + 1) / (1 + 1 + 0.5 + 0.3 + 0.2));
  });

  it('scoreDAGWithEconomy rises when aurora hints injected', () => {
    const dag = sampleDag();
    const low = scoreDAGWithEconomy(dag);
    const high = scoreDAGWithEconomy(dag, { auroraOpportunityScore: 0.95 });
    expect(high).toBeGreaterThan(low);
  });

  it('aggregateCostsFromDag and estimateValueFromDag are deterministic', () => {
    const dag = sampleDag();
    expect(aggregateCostsFromDag(dag)).toEqual(aggregateCostsFromDag(dag));
    expect(estimateValueFromDag(dag)).toEqual(estimateValueFromDag(dag));
  });
});
