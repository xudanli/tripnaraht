import { buildDecisionTrace } from './build-decision-trace';
import type { ExecutionSimulationReport } from '../execution-simulation/execution-simulation.types';

const simStub: ExecutionSimulationReport = {
  feasibilityScore: 0.8,
  riskScore: 0.2,
  issues: [],
  predictedExecutionFailureRate: 0.1,
  recommendation: 'APPROVE',
  dimensions: {
    time: {
      totalTravelMinEstimate: 0,
      totalVisitMinEstimate: 0,
      totalScheduledActiveMin: 0,
      overflowVsBudgetMin: 0,
      compressedSlotsCount: 0,
    },
    geo: { zoneTransitionCount: 0, clusterUniqueCount: 0, backtrackSegments: 0, fragmentationScore: 0 },
    fatigue: {
      peakDayScore: 0,
      cumulativeWalkingKm: 0,
      recoveryGapShortfallMin: 0,
      activityDensityPeak: 0,
    },
    volatility: {
      weatherSensitivityScore: 0,
      queueRiskScore: 0,
      closureRiskScore: 0,
      seasonalRiskScore: 0,
    },
  },
};

describe('buildDecisionTrace', () => {
  it('builds nodes and summary for HYBRID with arbitration', () => {
    const t = buildDecisionTrace({
      traceId: 'tr1',
      tripId: 'trip1',
      version: 2,
      rtMode: 'HYBRID',
      contractMode: 'EXPLORATION',
      intentSummary: { destination: 'JP', days: 2, draftRuntimeMode: 'HYBRID' },
      candidateCount: 40,
      solverContextInjected: false,
      arbitration: {
        slotDecisions: [
          {
            day: 1,
            slot: 'lunch',
            llmChoice: { day: 1, slot: 'lunch', placeId: 1 },
            algoChoice: { day: 1, slot: 'lunch', placeId: 2 },
            finalChoice: { day: 1, slot: 'lunch', placeId: 1 },
            decisionSource: 'LLM',
            reason: 'meal',
          },
        ],
        finalSelections: [{ day: 1, slot: 'lunch', placeId: 1 }],
        overrideTrace: [],
      },
      convergence: {
        agreementScore: 0.7,
        divergenceAreas: [{ day: 1, slot: 'morning', type: 'experience', llmChoice: 1, algoChoice: 2, reason: 'x' }],
        winnerStrategy: 'HYBRID',
        convergenceMode: 'HYBRID',
        overridePlan: [],
      },
      gate: {
        status: 'APPROVED',
        score: { feasibility: 0.8, continuity: 0.8, constraintSatisfaction: 0.8 },
        blockingIssues: [],
        repairActions: [],
      },
      simulation: simStub,
      dualEngineDivergenceCount: 1,
      failureDecisionTraces: [],
      failureReasonCodes: new Set(),
    });
    expect(t.nodes.some((n) => n.type === 'FINAL_SLOT')).toBe(true);
    expect(t.summary.llmInfluence).toBeGreaterThan(0);
    expect(t.edges.length).toBeGreaterThan(0);
  });
});
