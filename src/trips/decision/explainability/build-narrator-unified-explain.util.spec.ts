import { buildNarratorUnifiedExplain } from './build-narrator-unified-explain.util';
import type { DecisionLogEntry } from '../../../agent/interfaces/trip-plan.interface';
import { loadDecisionClosureGolden } from '../evaluation/decision-closure-assertions';
import { icelandDecisionClosureStormF208Case } from '../evaluation/e2e-cases/iceland-decision-closure-storm-f208.example';

describe('buildNarratorUnifiedExplain', () => {
  it('returns envelope + guardian narrative from orchestration log', () => {
    const hints = loadDecisionClosureGolden(icelandDecisionClosureStormF208Case.metadata ?? {});
    const log: DecisionLogEntry[] = [
      {
        request_id: 'req-n',
        step: 'GATE_EVAL',
        actor: 'Gatekeeper',
        inputs_summary: 'gate',
        outputs_summary: 'BLOCK: F208',
        evidence_refs: ['ev-f208'],
        timestamp: '2026-01-16T12:00:00.000Z',
        metadata: { guardian: 'ABU' },
      },
    ];
    const out = buildNarratorUnifiedExplain({
      requestId: 'req-n',
      orchestrationDecisionLog: log,
      optimizationHints: hints,
    });
    expect(out?.envelope.decision_trace.length).toBe(1);
    expect(out?.human.userFacingNarrative.abuSection).toContain('Abu');
    expect(out?.envelope.narrative?.sections.length).toBe(3);
  });
});
