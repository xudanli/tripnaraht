import { NZ_MILFORD_RAIN_DECISION_CLOSURE_LOGS } from '../evaluation/e2e-cases/nz-decision-closure-logs.fixture';
import { buildUnifiedExplainabilityEnvelope } from './build-unified-explainability-envelope.util';
import { projectExplainableOutputFromEnvelope } from './project-explainable-output-from-envelope.util';
import { UNIFIED_EXPLAINABILITY_CONTRACT_VERSION } from './unified-explainability.types';

describe('projectExplainableOutputFromEnvelope', () => {
  it('projects training ExplainableOutput from unified envelope with evidence chain', () => {
    const envelope = buildUnifiedExplainabilityEnvelope({
      requestId: 'req-train-1',
      decisionLogs: NZ_MILFORD_RAIN_DECISION_CLOSURE_LOGS,
      optimizationHints: {
        method: 'CGUS',
        recommendedAlternativeId: 'repair-milford-cruise-v1',
      },
      physicalEvidenceGate: 'error_critical_stages',
    });

    const output = projectExplainableOutputFromEnvelope(envelope, 'model-v1');
    expect(output.metadata.unified_contract_version).toBe(UNIFIED_EXPLAINABILITY_CONTRACT_VERSION);
    expect(output.decision_process.steps.length).toBeGreaterThanOrEqual(2);
    expect(output.evidence_chain.some((e) => e.evidence_id === 'ev-nz-sh94-closed')).toBe(true);
    expect(output.summary).toContain('trace');
    expect(output.visualization?.data.integrity).toBeDefined();
  });
});
