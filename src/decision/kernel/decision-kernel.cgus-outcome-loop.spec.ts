import { DecisionKernelService } from './decision-kernel.service';
import { StateManagerService } from './state-manager.service';
import type { DecisionState } from './decision-state.types';
import type { IDsoFeedbackPersistence } from './dso-feedback-persistence.interface';
import type { CgusDecisionTraceV1 } from '../../trips/decision/optimization/cgus-decision-trace.types';

describe('DecisionKernelService CGUS Outcome Loop', () => {
  const trace: CgusDecisionTraceV1 = {
    schemaVersion: 'cgus-decision-trace/v1',
    decision_id: 'run1:OPTIMIZE:v0',
    trip_id: 'run1',
    decision_type: 'OPTIMIZE',
    candidate_ids: ['A', 'B'],
    hard_constraint_result: 'all_feasible',
    hard_constraint_reasons: [],
    candidate_scores: {
      A: { safety: 0.8, expected_utility: 0.79 },
      B: { safety: 0.9, expected_utility: 0.73 },
    },
    ranking: ['A', 'B'],
    recommended_candidate: 'A',
  };

  function makeKernel(store: { dso?: DecisionState }) {
    const persistence: IDsoFeedbackPersistence = {
      getDso: jest.fn(async () => store.dso),
      persistDso: jest.fn(async (_id, dso) => {
        store.dso = dso;
      }),
    };
    const travelMemoryRuntime = {
      ingestCgusOutcomeLoop: jest.fn(),
    };
    const stateManager = new StateManagerService();
    const kernel = Object.create(DecisionKernelService.prototype) as DecisionKernelService;
    (kernel as any).stateManager = stateManager;
    (kernel as any).feedbackPersistence = persistence;
    (kernel as any).travelMemoryRuntime = travelMemoryRuntime;
    (kernel as any).logger = { warn: jest.fn(), log: jest.fn(), debug: jest.fn(), error: jest.fn() };
    return { kernel, persistence, travelMemoryRuntime };
  }

  it('persists OVERRIDE action and Trip Review summary', async () => {
    const store: { dso?: DecisionState } = {
      dso: {
        requestId: 'run1',
        userIntent: {} as any,
        tripState: {},
        environmentState: {},
        systemState: { requestId: 'run1', version: 2 },
        optimizationHints: { method: 'CGUS', cgusDecisionTrace: trace },
      } as DecisionState,
    };
    const { kernel, persistence, travelMemoryRuntime } = makeKernel(store);

    const written = await kernel.writeCgusDecisionOutcomeLoop({
      tripRunId: 'run1',
      payload: {
        kind: 'action',
        user_action: 'OVERRIDE',
        chosen_candidate: 'B',
        override_reason: '想看海岸',
      },
    });
    expect(written.ok).toBe(true);
    expect(written.persisted).toBe(true);
    expect(written.trace?.chosen_candidate).toBe('B');
    expect(written.summary?.recommended_candidate).toBe('A');
    expect(persistence.persistDso).toHaveBeenCalled();
    expect(travelMemoryRuntime.ingestCgusOutcomeLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'action',
        trace: expect.objectContaining({ chosen_candidate: 'B' }),
      }),
    );

    const outcome = await kernel.writeCgusDecisionOutcomeLoop({
      tripRunId: 'run1',
      payload: {
        kind: 'outcome',
        actual_outcome: { completed: true, safetyIncident: false },
        decision_regret: 'NONE',
      },
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.trace?.decision_regret).toBe('NONE');
    expect(travelMemoryRuntime.ingestCgusOutcomeLoop).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'outcome' }),
    );

    const reviewed = await kernel.writeCgusDecisionOutcomeLoop({
      tripRunId: 'run1',
      payload: {
        kind: 'diagnosis',
        recommendation_problematic: 'NO',
        reviewed_by: 'ops@nara',
      },
    });
    expect(reviewed.ok).toBe(true);
    expect(reviewed.trace?.root_cause).toBe('NONE');

    const get = await kernel.getCgusTripReview({ tripRunId: 'run1' });
    expect(get.ok).toBe(true);
    expect(get.summary?.user_action).toBe('OVERRIDE');
    expect(get.summary?.chosen_candidate).toBe('B');
    expect(store.dso?.systemState?.cgusDecisionTraceLog?.[0]?.user_action).toBe('OVERRIDE');
    expect(travelMemoryRuntime.ingestCgusOutcomeLoop).toHaveBeenCalledTimes(3);
  });

  it('backfills trip shadow north-star when pair seed exists on DSO', async () => {
    const store: { dso?: DecisionState } = {
      dso: {
        requestId: 'run1',
        userIntent: {} as any,
        tripState: {},
        environmentState: {},
        systemState: { requestId: 'run1', version: 2 },
        optimizationHints: {
          method: 'CGUS',
          cgusDecisionTrace: trace,
          tripShadowPair: {
            without: 'A',
            withMemory: 'B',
            decisionId: 'run1:OPTIMIZE:v0',
            tripId: 'run1',
            diverged: true,
            qualityDelta: 'UNKNOWN',
          },
          tripShadowPairRecord: {
            schemaId: 'tripnara.trip_shadow_pair@v1',
            version: 1,
            decisionPair: {
              schemaId: 'tripnara.decision_pair@v1',
              version: 1,
              decisionId: 'run1:OPTIMIZE:v0',
              tripId: 'run1',
              baseline: { context: 'without_memory', recommendation: 'A' },
              memoryAssisted: {
                context: 'with_memory',
                recommendation: 'B',
                memoryContribution: [],
              },
              diverged: true,
            },
            compareCase: {
              decisionId: 'run1:OPTIMIZE:v0',
              tripId: 'run1',
              withoutMemoryRecommendation: 'A',
              withMemoryRecommendation: 'B',
              diverged: true,
              memoryChangedRecommendation: true,
              qualityDelta: 'UNKNOWN',
            },
            northStarReady: false,
            notes: ['awaiting_user_outcome'],
          },
          memoryDecisionTrace: {
            schemaId: 'tripnara.memory_decision_trace@v1',
            version: 1,
            decisionId: 'run1:OPTIMIZE:v0',
            contextSources: {
              world: true,
              booking: false,
              team: false,
              memory: true,
            },
            memoryContribution: { used: true, influence: [] },
          },
        },
      } as DecisionState,
    };
    const { kernel } = makeKernel(store);

    const accept = await kernel.writeCgusDecisionOutcomeLoop({
      tripRunId: 'run1',
      payload: { kind: 'action', user_action: 'ACCEPT' },
    });
    expect(accept.ok).toBe(true);
    expect(accept.tripShadowPair?.qualityDelta).toBe('IMPROVED');

    const outcome = await kernel.writeCgusDecisionOutcomeLoop({
      tripRunId: 'run1',
      payload: {
        kind: 'outcome',
        actual_outcome: { completed: true, safetyIncident: false },
        decision_regret: 'NONE',
      },
    });
    expect(outcome.tripShadowNorthStar?.answerable).toBe(true);
    expect(outcome.tripShadowNorthStar?.preventedMistakeCount).toBe(1);
    expect(store.dso?.systemState?.tripShadowCaseLog?.[0]?.qualityDelta).toBe(
      'IMPROVED',
    );
  });

  it('DSO writeback still succeeds when travel memory ingest throws', async () => {
    const store: { dso?: DecisionState } = {
      dso: {
        requestId: 'run1',
        userIntent: {} as any,
        tripState: {},
        environmentState: {},
        systemState: { requestId: 'run1', version: 2 },
        optimizationHints: { method: 'CGUS', cgusDecisionTrace: trace },
      } as DecisionState,
    };
    const { kernel, travelMemoryRuntime } = makeKernel(store);
    travelMemoryRuntime.ingestCgusOutcomeLoop.mockImplementation(() => {
      throw new Error('ledger down');
    });

    const written = await kernel.writeCgusDecisionOutcomeLoop({
      tripRunId: 'run1',
      payload: { kind: 'action', user_action: 'ACCEPT' },
    });
    expect(written.ok).toBe(true);
    expect(written.persisted).toBe(true);
    expect(written.trace?.user_action).toBe('ACCEPT');
  });
});
