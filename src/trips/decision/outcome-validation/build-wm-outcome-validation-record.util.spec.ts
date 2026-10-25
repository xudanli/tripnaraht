/**
 * Unit: B-better judge heuristics.
 */

import { judgeBWasBetter } from './build-wm-outcome-validation-record.util';
import type { DecisionRecommendationView } from './wm-outcome-validation.types';

const A: DecisionRecommendationView = {
  id: 'A',
  summary: 'ALLOW_F208_OPEN',
  gateBlocks: false,
  gateRequiresVerification: false,
  cgusFeasible: true,
  worldSees: 'OPEN',
};
const B: DecisionRecommendationView = {
  id: 'B',
  summary: 'BLOCK_F208',
  gateBlocks: true,
  gateRequiresVerification: false,
  cgusFeasible: false,
  worldSees: 'CLOSED',
};

describe('judgeBWasBetter', () => {
  it('null when decisions identical', () => {
    const v = judgeBWasBetter({
      decisionDiffered: false,
      served: 'WITH_BRIDGE',
      user: { action: 'ACCEPT' },
      execution: { status: 'EXECUTED', repairOccurred: false },
      outcome: { success: 'SUCCESS' },
      experience: {},
      safety: { result: 'NEUTRAL' },
      without: A,
      withB: A,
    });
    expect(v.bWasBetter).toBeNull();
  });

  it('true when served B avoided risk', () => {
    const v = judgeBWasBetter({
      decisionDiffered: true,
      served: 'WITH_BRIDGE',
      user: { action: 'ACCEPT' },
      execution: { status: 'EXECUTED', repairOccurred: false },
      outcome: { success: 'SUCCESS' },
      experience: { regret: false },
      safety: { result: 'AVOIDED_RISK' },
      without: A,
      withB: B,
    });
    expect(v.bWasBetter).toBe(true);
  });
});
