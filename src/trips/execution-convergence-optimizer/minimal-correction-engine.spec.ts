import type { TripWorldState } from '../decision/world-model';
import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import {
  applyMinimalNeptunePatches,
  planMinimalNeptunePatches,
  resolveCorrectionStrategy,
} from './minimal-correction-engine';
import type { EcoNeptuneClosureEvaluation } from '../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types';
import type { EcoOrchestrationResultLike } from '../execution-cognitive-orchestrator/closure-controller';

function fakeClosure(partial: Partial<EcoNeptuneClosureEvaluation>): EcoNeptuneClosureEvaluation {
  return {
    ecoDriftScore: 0,
    stabilityScore: 1,
    semanticConvergence: 1,
    shouldRerunNeptune: true,
    reasons: [],
    thresholds: { driftMax: 0.35, stabilityMin: 0.7, convergenceMin: 0.6 },
    ...partial,
  };
}

describe('minimal-correction-engine', () => {
  it('resolveCorrectionStrategy defaults to full retry', () => {
    const state = {
      context: {
        destination: 'x',
        startDate: '2026-06-01',
        durationDays: 1,
        preferences: { intents: {}, pace: 'moderate', riskTolerance: 'low' },
      },
      candidatesByDate: {},
      signals: { lastUpdatedAt: new Date().toISOString() },
    } as TripWorldState;
    expect(resolveCorrectionStrategy(state)).toBe('full_neptune_retry');
  });

  it('plans DAG decrease when stability below threshold', () => {
    const dag: ExecutionTruthDAG = {
      nodes: [],
      edges: [
        {
          id: 'e1',
          from: 'a',
          to: 'b',
          type: 'TEMPORAL_SEQUENCE',
          weight: 40,
        },
      ],
    };
    const state = {
      context: {
        destination: 'x',
        startDate: '2026-06-01',
        durationDays: 1,
        preferences: { intents: {}, pace: 'moderate', riskTolerance: 'low' },
      },
      candidatesByDate: {},
      signals: {
        lastUpdatedAt: new Date().toISOString(),
        executionTruthDAG: dag,
      },
    } as TripWorldState;

    const closure = fakeClosure({ stabilityScore: 0.5 });
    const eco = {
      neptuneResult: {} as EcoOrchestrationResultLike['neptuneResult'],
      digest: { ran: true, mode: 'full' as const },
    };

    const planned = planMinimalNeptunePatches(state, closure, eco);
    expect(planned.some(p => p.target === 'DAG')).toBe(true);
  });

  it('applyMinimalNeptunePatches updates DAG and recompiles IR', () => {
    const dag: ExecutionTruthDAG = {
      nodes: [
        {
          id: 'n1',
          date: '2026-06-01',
          slotId: 's1',
          type: 'LEG',
          execution: {
            finalState: 'OK',
            delayMinutes: 0,
            reliabilityScore: 0.9,
          },
          temporal: {
            daylightViolation: false,
            crossDayRisk: 0,
            arrivalRisk: 0,
          },
          weather: { exposureScore: 0 },
          road: { accessibility: 1 },
        },
      ],
      edges: [
        {
          id: 'e-walk',
          from: 'n1',
          to: 'n1',
          type: 'TEMPORAL_SEQUENCE',
          weight: 30,
        },
      ],
    };

    const state = {
      context: {
        destination: 'x',
        startDate: '2026-06-01',
        durationDays: 1,
        preferences: { intents: {}, pace: 'moderate', riskTolerance: 'low' },
      },
      candidatesByDate: {},
      signals: {
        lastUpdatedAt: new Date().toISOString(),
        executionTruthDAG: dag,
      },
    } as TripWorldState;

    const out = applyMinimalNeptunePatches(state, [
      {
        target: 'DAG',
        delta: [{ target: 'e-walk', op: 'DECREASE_WEIGHT', reason: 'test' }],
        reason: 'test',
      },
    ]);

    expect(out.dagMutated).toBe(true);
    expect(state.signals.executionIR?.steps.length).toBeGreaterThan(0);
    const traverse = state.signals.executionIR?.steps.filter(s => s.type === 'TRAVERSE');
    expect(traverse?.length).toBeGreaterThan(0);
  });
});
