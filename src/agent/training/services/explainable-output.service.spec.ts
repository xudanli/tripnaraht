import { UNIFIED_EXPLAINABILITY_CONTRACT_VERSION } from '../../../trips/decision/explainability/unified-explainability.types';
import { ExplainableOutputService } from './explainable-output.service';

describe('ExplainableOutputService (unified envelope path)', () => {
  const service = new ExplainableOutputService();

  it('prefers unified envelope projection over legacy heuristic', async () => {
    const envelope = {
      contract_version: UNIFIED_EXPLAINABILITY_CONTRACT_VERSION,
      request_id: 'req-train',
      trace_id: 'req-train',
      generated_at: '2026-03-12T08:00:00.000Z',
      decision_trace: [
        {
          log_index: 0,
          persona: 'ABU',
          action: 'REJECT',
          decision_source: 'PHYSICAL',
          decision_stage: 'ABU_GATE',
          reason_codes: ['WORLD_ROAD_CLOSED'],
          evidence_refs: ['ev-1'],
          explanation: 'road closed',
        },
      ],
      grounded_factors: [
        {
          factor_id: 'f1',
          kind: 'PHYSICAL',
          severity: 'BLOCK',
          anchor_log_indices: [0],
          anchor_evidence_refs: ['ev-1'],
          rejection_reason: 'SH94 closed',
        },
      ],
      integrity: {
        traceability_valid: true,
        physical_evidence_complete: true,
        narrative_anchored: true,
        drift_violations: [],
      },
    };

    const output = await service.generateExplanation([], [], 'model-v1', 'req-train', {
      unifiedEnvelope: envelope as any,
    });

    expect(output.metadata.unified_contract_version).toBe(UNIFIED_EXPLAINABILITY_CONTRACT_VERSION);
    expect(output.evidence_chain.some((e) => e.evidence_id === 'ev-1')).toBe(true);
    expect(output.decision_process.steps[0].step_name).toContain('ABU');
  });
});
