import { resolveUnifiedExplainForRouteAndRunResponse, resolveUnifiedExplainSource } from './resolve-unified-explain-for-response.util';
import { UNIFIED_EXPLAINABILITY_CONTRACT_VERSION } from './unified-explainability.types';
import type { NarrationLike } from '../../../decision/kernel/interfaces/phase-executor.interface';

describe('resolveUnifiedExplainForRouteAndRunResponse', () => {
  const requestId = 'req-dedup-1';
  const narrationEnvelope = {
    contract_version: UNIFIED_EXPLAINABILITY_CONTRACT_VERSION,
    request_id: requestId,
    trace_id: requestId,
    generated_at: '2026-03-12T08:00:00.000Z',
    decision_trace: [{ log_index: 0 } as any],
    grounded_factors: [],
    integrity: {
      traceability_valid: true,
      physical_evidence_complete: true,
      narrative_anchored: true,
      drift_violations: [],
    },
  };

  it('reuses narration.unified_explainability when request_id matches', () => {
    const narration: NarrationLike = {
      user_friendly_summary: 'x',
      day_by_day_narrative: [],
      highlights: [],
      tips: [],
      unified_explainability: narrationEnvelope as any,
    };
    const resolved = resolveUnifiedExplainForRouteAndRunResponse({
      requestId,
      orchestrationDecisionLog: [],
      narrationFromState: narration,
    });
    expect(resolved).toBe(narrationEnvelope);
    expect(resolveUnifiedExplainSource({ requestId, narrationFromState: narration })).toBe('narration');
  });

  it('falls back to assembler build when narration envelope request_id mismatches', () => {
    const mismatchedNarration: NarrationLike = {
      user_friendly_summary: 'x',
      day_by_day_narrative: [],
      highlights: [],
      tips: [],
      unified_explainability: {
        ...narrationEnvelope,
        request_id: 'other',
        trace_id: 'other',
      } as any,
    };
    const resolved = resolveUnifiedExplainForRouteAndRunResponse({
      requestId,
      orchestrationDecisionLog: [
        {
          request_id: requestId,
          step: 'GATE_EVAL',
          actor: 'Gatekeeper',
          inputs_summary: '',
          outputs_summary: 'ok',
          evidence_refs: [],
          timestamp: '2026-03-12T08:00:00.000Z',
        },
      ],
      decisionState: {
        optimizationHints: {
          method: 'CGUS',
          recommendedAlternativeId: 'base',
        },
      } as any,
      narrationFromState: mismatchedNarration,
    });
    expect(resolved?.request_id).toBe(requestId);
    expect(
      resolveUnifiedExplainSource({ requestId, narrationFromState: mismatchedNarration }),
    ).toBe('assembler');
  });
});
