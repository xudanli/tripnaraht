import { buildUnifiedExplainabilityEnvelope } from './build-unified-explainability-envelope.util';
import { UNIFIED_EXPLAINABILITY_CONTRACT_VERSION } from './unified-explainability.types';
import type { DecisionLogEntry } from '../shared/decision-result.types';
import type { OptimizationHints } from '../../../decision/kernel/decision-state.types';
import { loadDecisionClosureGolden } from '../evaluation/decision-closure-assertions';
import { icelandDecisionClosureStormF208Case } from '../evaluation/e2e-cases/iceland-decision-closure-storm-f208.example';
import { ICELAND_F208_DECISION_CLOSURE_LOGS } from '../evaluation/e2e-cases/iceland-decision-closure-logs.fixture';

describe('buildUnifiedExplainabilityEnvelope (unified-explainability@v1)', () => {
  const iso = '2026-01-16T12:00:00.000Z';

  const icelandLogs: DecisionLogEntry[] = ICELAND_F208_DECISION_CLOSURE_LOGS;

  it('builds envelope with decision_trace and optimization projection', () => {
    const hints = loadDecisionClosureGolden(icelandDecisionClosureStormF208Case.metadata ?? {}) as
      | OptimizationHints
      | undefined;
    expect(hints).toBeDefined();

    const envelope = buildUnifiedExplainabilityEnvelope({
      requestId: 'req-iceland-f208',
      traceId: 'trace-f208',
      decisionLogs: icelandLogs,
      optimizationHints: hints,
      generatedAt: iso,
      physicalEvidenceGate: 'warn',
    });

    expect(envelope.contract_version).toBe(UNIFIED_EXPLAINABILITY_CONTRACT_VERSION);
    expect(envelope.decision_trace).toHaveLength(2);
    expect(envelope.decision_trace[0].evidence_refs).toContain('ev-road-f208-closed');
    expect(envelope.optimization_projection?.decision_verdict?.chosen_plan_id).toBe(
      'repair-spatial-poi-v2',
    );
    expect(envelope.grounded_factors.length).toBeGreaterThan(0);
    expect(envelope.integrity.traceability_valid).toBe(true);
    expect(envelope.integrity.physical_evidence_complete).toBe(true);
  });

  it('flags physical evidence drift when gate=error_critical_stages and refs missing', () => {
    const envelope = buildUnifiedExplainabilityEnvelope({
      requestId: 'req-drift',
      decisionLogs: [
        {
          ...icelandLogs[0],
          evidenceRefs: undefined,
        },
      ],
      physicalEvidenceGate: 'error_critical_stages',
      generatedAt: iso,
    });

    expect(envelope.integrity.traceability_valid).toBe(false);
    expect(envelope.integrity.physical_evidence_complete).toBe(false);
    expect(envelope.integrity.drift_violations.some((v) => v.includes('evidenceRefs'))).toBe(true);
  });

  it('rejects llm_polished narrative with orphan factor anchors', () => {
    const envelope = buildUnifiedExplainabilityEnvelope({
      requestId: 'req-narrative',
      decisionLogs: icelandLogs,
      physicalEvidenceGate: 'warn',
      generatedAt: iso,
      narrative: {
        locale: 'zh',
        mode: 'llm_polished',
        sections: [
          {
            headline: '路况',
            body: 'F208 已关闭',
            anchored_factor_ids: ['nonexistent_factor'],
          },
        ],
      },
    });

    expect(envelope.integrity.narrative_anchored).toBe(false);
    expect(envelope.integrity.drift_violations.some((v) => v.includes('orphan factor_id'))).toBe(
      true,
    );
  });
});
