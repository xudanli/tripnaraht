import type { CgusDecisionTraceV1 } from '../../trips/decision/optimization/cgus-decision-trace.types';
import { buildTripShadowPair } from './build-trip-shadow-pair.util';
import {
  backfillTripShadowPairFromCgusTrace,
  buildTripShadowOutcomePatch,
  mapCgusRegretToNumber,
} from './backfill-trip-shadow-from-cgus.util';

function baseTrace(over?: Partial<CgusDecisionTraceV1>): CgusDecisionTraceV1 {
  return {
    schemaVersion: 'cgus-decision-trace/v1',
    decision_id: 'T1:OPTIMIZE:v0',
    trip_id: 'T1',
    decision_type: 'OPTIMIZE',
    candidate_ids: ['plan-high-density', 'plan-relaxed-pace'],
    hard_constraint_result: 'all_feasible',
    hard_constraint_reasons: [],
    candidate_scores: {},
    ranking: ['plan-relaxed-pace', 'plan-high-density'],
    recommended_candidate: 'plan-relaxed-pace',
    ...over,
  };
}

describe('backfillTripShadowFromCgus', () => {
  it('maps regret enums', () => {
    expect(mapCgusRegretToNumber('NONE')).toBe(0);
    expect(mapCgusRegretToNumber('HIGH')).toBe(0.75);
    expect(mapCgusRegretToNumber('UNKNOWN')).toBeNull();
  });

  it('backfills ACCEPT + low regret as IMPROVED when diverged', () => {
    const pair = backfillTripShadowPairFromCgusTrace({
      seed: {
        decisionId: 'T1:OPTIMIZE:v0',
        tripId: 'T1',
        withoutMemoryRecommendation: 'plan-high-density',
        withMemoryRecommendation: 'plan-relaxed-pace',
        memoryDecisionTrace: {
          schemaId: 'tripnara.memory_decision_trace@v1',
          version: 1,
          decisionId: 'T1:OPTIMIZE:v0',
          contextSources: {
            world: true,
            booking: false,
            team: false,
            memory: true,
          },
          memoryContribution: {
            used: true,
            influence: [
              {
                id: 'M1',
                memoryId: 'M1',
                influence: 'PACE_CONSTRAINT',
                weight: 0.4,
                confidence: 0.9,
              },
            ],
          },
        },
      },
      trace: baseTrace({
        user_action: 'ACCEPT',
        chosen_candidate: 'plan-relaxed-pace',
        decision_regret: 'NONE',
        actual_outcome: { completed: true, safetyIncident: false },
      }),
    });
    expect(pair?.compareCase.qualityDelta).toBe('IMPROVED');
    expect(pair?.northStarReady).toBe(true);
    expect(pair?.compareCase.userChosen).toBe('plan-relaxed-pace');
  });

  it('patches DSO hints and accumulates case log', () => {
    const initial = buildTripShadowPair({
      decisionId: 'T1:OPTIMIZE:v0',
      tripId: 'T1',
      withoutMemoryRecommendation: 'plan-high-density',
      withMemoryRecommendation: 'plan-relaxed-pace',
      memoryDecisionTrace: {
        schemaId: 'tripnara.memory_decision_trace@v1',
        version: 1,
        decisionId: 'T1:OPTIMIZE:v0',
        contextSources: {
          world: true,
          booking: false,
          team: false,
          memory: true,
        },
        memoryContribution: { used: true, influence: [] },
      },
    })!;

    const patch = buildTripShadowOutcomePatch({
      hints: {
        tripShadowPairRecord: initial,
        tripShadowPair: {
          without: 'plan-high-density',
          withMemory: 'plan-relaxed-pace',
          decisionId: 'T1:OPTIMIZE:v0',
          tripId: 'T1',
        },
        memoryDecisionTrace: {
          schemaId: 'tripnara.memory_decision_trace@v1',
          version: 1,
          decisionId: 'T1:OPTIMIZE:v0',
          contextSources: {
            world: true,
            booking: false,
            team: false,
            memory: true,
          },
          memoryContribution: { used: true, influence: [] },
        },
      },
      trace: baseTrace({
        user_action: 'OVERRIDE',
        chosen_candidate: 'plan-high-density',
        decision_regret: 'HIGH',
        actual_outcome: { completed: false, safetyIncident: false },
      }),
    });

    expect(patch).not.toBeNull();
    expect(patch!.tripShadowPairRecord.compareCase.qualityDelta).toBe('WORSENED');
    expect(patch!.tripShadowCaseLog).toHaveLength(1);
    expect(patch!.tripShadowNorthStar.harmCount).toBe(1);
    expect(patch!.tripShadowNorthStar.promotionBlocked).toBe(true);
  });
});
