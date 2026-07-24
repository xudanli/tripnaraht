import {
  UNIFIED_EXPLAINABILITY_CLIENT_REF,
  dedupeUnifiedExplainabilityInClientOrchestratorState,
} from './dedupe-unified-explainability-client-payload.util';
import { UNIFIED_EXPLAINABILITY_CONTRACT_VERSION } from './unified-explainability.types';

describe('dedupeUnifiedExplainabilityInClientOrchestratorState', () => {
  const envelope = {
    contract_version: UNIFIED_EXPLAINABILITY_CONTRACT_VERSION,
    request_id: 'req-1',
    trace_id: 'req-1',
    generated_at: '2026-03-12T08:00:00.000Z',
    decision_trace: [],
    grounded_factors: [],
    integrity: {
      traceability_valid: true,
      physical_evidence_complete: true,
      narrative_anchored: true,
      drift_violations: [],
    },
  };

  it('replaces narration.unified_explainability with unified_explainability_ref when explain.unified present', () => {
    const state = {
      narration: {
        user_friendly_summary: 'summary',
        day_by_day_narrative: [],
        highlights: [],
        tips: [],
        unified_explainability: envelope as any,
      },
    } as any;

    const deduped = dedupeUnifiedExplainabilityInClientOrchestratorState(state, envelope as any);
    expect(deduped?.narration?.unified_explainability).toBeUndefined();
    expect(deduped?.narration?.unified_explainability_ref).toBe(UNIFIED_EXPLAINABILITY_CLIENT_REF);
    expect(deduped?.narration?.user_friendly_summary).toBe('summary');
  });

  it('leaves state unchanged when explain.unified is absent', () => {
    const state = {
      narration: {
        user_friendly_summary: 'summary',
        day_by_day_narrative: [],
        highlights: [],
        tips: [],
        unified_explainability: envelope as any,
      },
    } as any;

    const deduped = dedupeUnifiedExplainabilityInClientOrchestratorState(state, undefined);
    expect(deduped?.narration?.unified_explainability).toBe(envelope);
    expect(deduped?.narration?.unified_explainability_ref).toBeUndefined();
  });
});
