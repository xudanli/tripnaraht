import { runDraftValidationGate } from './draft-validation-gate';
import type { TripDraftState } from '../state/trip-draft-state.types';
import type { ConvergenceResult } from '../convergence/convergence.types';

function minimalState(): TripDraftState {
  return {
    tripId: 't1',
    intent: {
      rawInput: '',
      destination: 'JP',
      cities: [],
      mustHavePois: [],
    },
    calendar: [],
    selections: [],
    constraintLog: { mealUsed: {}, placeRepeatCount: {} },
    topology: { zoneTransitions: [] },
    uncertainty: { items: [] },
    mode: 'LLM',
    version: 1,
  };
}

function convergenceFixture(partial: Partial<ConvergenceResult>): ConvergenceResult {
  return {
    agreementScore: 1,
    divergenceAreas: [],
    winnerStrategy: 'HYBRID',
    convergenceMode: 'HYBRID',
    overridePlan: [],
    ...partial,
  };
}

describe('runDraftValidationGate', () => {
  it('rejects missing dual engine', () => {
    const r = runDraftValidationGate({
      state: minimalState(),
      convergence: convergenceFixture({}),
      llmEngineRan: true,
      algoEngineRan: false,
    });
    expect(r.status).toBe('NEEDS_REPAIR');
    expect(r.blockingIssues[0].type).toBe('dual_engine_required');
  });

  it('approves only when no divergence and dual ran', () => {
    const r = runDraftValidationGate({
      state: minimalState(),
      convergence: convergenceFixture({
        agreementScore: 0.9,
        divergenceAreas: [],
      }),
      llmEngineRan: true,
      algoEngineRan: true,
    });
    expect(r.status).toBe('APPROVED');
  });

  it('needs repair when divergence remains', () => {
    const r = runDraftValidationGate({
      state: minimalState(),
      convergence: convergenceFixture({
        agreementScore: 0.8,
        divergenceAreas: [
          {
            day: 1,
            slot: 'morning',
            type: 'experience',
            llmChoice: 1,
            algoChoice: 2,
            reason: 'test',
          },
        ],
      }),
      llmEngineRan: true,
      algoEngineRan: true,
    });
    expect(r.status).toBe('NEEDS_REPAIR');
  });

  it('approves with slot arbitration merge despite raw divergence', () => {
    const r = runDraftValidationGate({
      state: minimalState(),
      convergence: convergenceFixture({
        agreementScore: 0.75,
        divergenceAreas: [
          {
            day: 1,
            slot: 'morning',
            type: 'experience',
            llmChoice: 1,
            algoChoice: 2,
            reason: 'test',
          },
        ],
      }),
      llmEngineRan: true,
      algoEngineRan: true,
      options: { acceptSlotArbitrationMerge: true },
    });
    expect(r.status).toBe('APPROVED');
  });
});
