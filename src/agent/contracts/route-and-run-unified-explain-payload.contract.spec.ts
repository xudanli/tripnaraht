/**
 * route_and_run：explain.unified SSOT + narration.unified_explainability_ref 去重契约。
 */
import {
  dedupeUnifiedExplainabilityInClientOrchestratorState,
  UNIFIED_EXPLAINABILITY_CLIENT_REF,
} from '../../trips/decision/explainability/dedupe-unified-explainability-client-payload.util';
import { resolveUnifiedExplainForRouteAndRunResponse } from '../../trips/decision/explainability/resolve-unified-explain-for-response.util';
import { UNIFIED_EXPLAINABILITY_CONTRACT_VERSION } from '../../trips/decision/explainability/unified-explainability.types';
import type { NarrationLike } from '../../decision/kernel/interfaces/phase-executor.interface';

describe('route_and_run unified explain client payload (P0)', () => {
  const requestId = 'req-payload-1';

  it('reuses narration envelope for explain.unified then strips duplicate from client state', () => {
    const envelope = {
      contract_version: UNIFIED_EXPLAINABILITY_CONTRACT_VERSION,
      request_id: requestId,
      trace_id: requestId,
      generated_at: '2026-03-12T08:00:00.000Z',
      decision_trace: [{ log_index: 0, persona: 'ABU', action: 'REJECT' } as any],
      grounded_factors: [],
      integrity: {
        traceability_valid: true,
        physical_evidence_complete: true,
        narrative_anchored: true,
        drift_violations: [],
      },
    };

    const narration: NarrationLike = {
      user_friendly_summary: 'summary',
      day_by_day_narrative: [],
      highlights: [],
      tips: [],
      unified_explainability: envelope as any,
    };

    const unified = resolveUnifiedExplainForRouteAndRunResponse({
      requestId,
      orchestrationDecisionLog: [],
      narrationFromState: narration,
    });
    expect(unified).toBe(envelope);

    const clientState = dedupeUnifiedExplainabilityInClientOrchestratorState(
      { narration: narration as any },
      unified,
    );
    expect(clientState?.narration?.unified_explainability).toBeUndefined();
    expect(clientState?.narration?.unified_explainability_ref).toBe(UNIFIED_EXPLAINABILITY_CLIENT_REF);
  });
});
