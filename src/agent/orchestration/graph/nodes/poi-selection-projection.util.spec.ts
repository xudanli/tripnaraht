import {
  POI_SELECTION_WORKSPACE_KEY,
  sanitizeOrchestratorStateAfterPoiSelection,
  sanitizeOrchestratorStateBeforePoiSelection,
} from './poi-selection-projection.util';

describe('poi-selection-projection', () => {
  it('strips __poi* workspace keys from state root and metadata', () => {
    const state = {
      request_id: 'r1',
      metadata: {
        [POI_SELECTION_WORKSPACE_KEY]: { candidatePool: [1, 2, 3] },
        __poiScoreRows: [{ score: 1 }],
        poiPlanningOutcome: { ok: true },
      },
      decision_log: [],
    } as any;

    sanitizeOrchestratorStateBeforePoiSelection(state);
    expect((state as any)[POI_SELECTION_WORKSPACE_KEY]).toBeUndefined();
    expect(state.metadata.__poiScoreRows).toBeUndefined();
    expect(state.metadata.poiPlanningOutcome).toEqual({ ok: true });

    sanitizeOrchestratorStateAfterPoiSelection(state);
    expect(state.metadata.__poiScoreRows).toBeUndefined();
  });
});
