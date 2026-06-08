import { buildRouteAndRunUnifiedExplain } from './build-route-and-run-unified-explain.util';
import { loadDecisionClosureGolden } from '../evaluation/decision-closure-assertions';
import { icelandDecisionClosureStormF208Case } from '../evaluation/e2e-cases/iceland-decision-closure-storm-f208.example';
import type { DecisionLogEntry } from '../../../agent/interfaces/trip-plan.interface';
import { UNIFIED_EXPLAINABILITY_CONTRACT_VERSION } from './unified-explainability.types';

describe('buildRouteAndRunUnifiedExplain', () => {
  it('builds unified envelope from orchestration log + optimization hints', () => {
    const hints = loadDecisionClosureGolden(icelandDecisionClosureStormF208Case.metadata ?? {});
    const orchLog: DecisionLogEntry[] = [
      {
        request_id: 'req-f208',
        step: 'GATE_EVAL',
        actor: 'Gatekeeper',
        inputs_summary: 'evaluate F208 closure',
        outputs_summary: 'BLOCK: F208 封路',
        evidence_refs: ['ev-road-f208-closed'],
        timestamp: '2026-01-16T12:00:00.000Z',
        metadata: { guardian: 'ABU' },
      },
      {
        request_id: 'req-f208',
        step: 'REPAIR',
        actor: 'LocalInsight',
        inputs_summary: 'spatial repair',
        outputs_summary: 'REPLACE: 南岸备选',
        evidence_refs: ['ev-road-f208-closed', 'ev-repair-v2'],
        timestamp: '2026-01-16T12:05:00.000Z',
        metadata: { guardian: 'NEPTUNE' },
      },
    ];

    const envelope = buildRouteAndRunUnifiedExplain({
      requestId: 'req-f208',
      orchestrationDecisionLog: orchLog,
      decisionState: { optimizationHints: hints } as any,
    });

    expect(envelope?.contract_version).toBe(UNIFIED_EXPLAINABILITY_CONTRACT_VERSION);
    expect(envelope?.decision_trace.length).toBe(2);
    expect(envelope?.optimization_projection?.decision_verdict?.chosen_plan_id).toBe(
      'repair-spatial-poi-v2',
    );
    expect(envelope?.narrative?.sections.length).toBe(3);
  });
});
