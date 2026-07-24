import { buildAttentionInternalDualReadComparison } from './attention-internal-dual-read-comparison.util';
import type {
  AttentionOrchestrationProblemInput,
  RootCauseCluster,
  UnifiedDecisionItemProjection,
} from '../contracts/attention-orchestration.types';

const TRIP_ID = 'c0c77777-7777-4777-8777-777777777777';

function primaryItem(
  overrides: Partial<UnifiedDecisionItemProjection> & {
    primaryProblemId: string;
    relatedEffects?: UnifiedDecisionItemProjection['relatedEffects'];
  },
): UnifiedDecisionItemProjection {
  return {
    clusterId: 'cluster_1',
    tripId: TRIP_ID,
    primarySemanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE',
    headline: 'headline',
    explanation: 'explanation',
    causalStory: [],
    attentionLevel: 'QUEUE',
    status: 'OPEN',
    relatedEffects: overrides.relatedEffects ?? [],
    confirmationEntry: { problemId: overrides.primaryProblemId, actionRoute: 'decision-queue' },
    firstObservedAt: '2026-07-12T12:00:00.000Z',
    lastUpdatedAt: '2026-07-12T12:00:00.000Z',
    ...overrides,
  };
}

describe('buildAttentionInternalDualReadComparison', () => {
  it('computes reduction and hidden problem ids for merged wind chain', () => {
    const comparison = buildAttentionInternalDualReadComparison({
      currentQueueItems: [
        { problemId: 'p_wind' },
        { problemId: 'p_infeasible' },
        { problemId: 'p_night' },
      ],
      attentionPrimaryItems: [
        primaryItem({
          primaryProblemId: 'p_infeasible',
          relatedEffects: [
            { problemId: 'p_wind', semanticCapability: 'WEATHER_STRONG_WIND', label: '强风' },
            { problemId: 'p_night', semanticCapability: 'NIGHT_DRIVING_RISK', label: '夜间驾驶' },
          ],
        }),
      ],
      shadowClusters: [
        {
          clusterId: 'cluster_1',
          tripId: TRIP_ID,
          rootCauseKey: 'weather.is:ep:wind',
          rootCauseType: 'WEATHER_STRONG_WIND',
          primaryProblemId: 'p_infeasible',
          relatedProblemIds: ['p_wind', 'p_night'],
          causalChain: [],
          attentionLevel: 'QUEUE',
          status: 'OPEN',
          firstObservedAt: '2026-07-12T12:00:00.000Z',
          lastUpdatedAt: '2026-07-12T12:00:00.000Z',
        },
      ],
      inputProblems: [
        { problemId: 'p_wind', tripId: TRIP_ID, semanticCapability: 'WEATHER_STRONG_WIND', status: 'OPEN', detectedAt: '2026-07-12T12:00:00.000Z' },
        { problemId: 'p_infeasible', tripId: TRIP_ID, semanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE', status: 'OPEN', detectedAt: '2026-07-12T12:20:00.000Z' },
        { problemId: 'p_night', tripId: TRIP_ID, semanticCapability: 'NIGHT_DRIVING_RISK', status: 'OPEN', detectedAt: '2026-07-12T15:30:00.000Z' },
      ] satisfies AttentionOrchestrationProblemInput[],
    });

    expect(comparison.currentVisibleCount).toBe(3);
    expect(comparison.attentionVisibleCount).toBe(1);
    expect(comparison.reductionCount).toBe(2);
    expect(comparison.primaryProblemIds).toEqual(['p_infeasible']);
    expect(comparison.hiddenProblemIds.sort()).toEqual(['p_night', 'p_wind']);
    expect(comparison.missedProblemIds).toEqual([]);
  });

  it('flags missed problems when current queue item has no visible primary', () => {
    const comparison = buildAttentionInternalDualReadComparison({
      currentQueueItems: [{ problemId: 'p_road' }],
      attentionPrimaryItems: [],
      shadowClusters: [],
      inputProblems: [],
    });

    expect(comparison.missedProblemIds).toEqual(['p_road']);
    expect(comparison.reductionCount).toBe(1);
  });
});
