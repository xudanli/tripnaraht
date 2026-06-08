import { ClaudeNarratorAgentService } from './narrator-agent.service';
import { DecisionExplainForHumanSkill } from '../../../skills/decision/decision-explain-for-human.skill';
import type { GateResult, Itinerary, OrchestratorState } from '../../interfaces/trip-plan.interface';
import type { DecisionLogEntry } from '../../interfaces/trip-plan.interface';
import { loadDecisionClosureGolden } from '../../../trips/decision/evaluation/decision-closure-assertions';
import { icelandDecisionClosureStormF208Case } from '../../../trips/decision/evaluation/e2e-cases/iceland-decision-closure-storm-f208.example';

describe('ClaudeNarratorAgentService unified explain (Phase 3)', () => {
  const allowGate = (): GateResult =>
    ({
      gate_result: 'ALLOW',
      violations: [],
      required_adjustments: [],
      confidence: 0.9,
    }) as GateResult;

  const orchLog: DecisionLogEntry[] = [
    {
      request_id: 'req-narr-unified',
      step: 'GATE_EVAL',
      actor: 'Gatekeeper',
      inputs_summary: 'evaluate',
      outputs_summary: 'BLOCK: F208 closed',
      evidence_refs: ['ev-f208'],
      timestamp: '2026-01-16T12:00:00.000Z',
      metadata: { guardian: 'ABU' },
    },
  ];

  it('attaches unified_explainability via decision.explainForHuman skill', async () => {
    const hints = loadDecisionClosureGolden(icelandDecisionClosureStormF208Case.metadata ?? {});
    const skill = {
      execute: jest.fn().mockResolvedValue({
        userFacingNarrative: {
          abuSection: 'Abu skill section',
          drdreSection: 'Dr skill section',
          neptuneSection: 'Neptune skill section',
        },
        riskHighlights: [],
        tradeOffs: [],
        unified: {
          contract_version: 'unified-explainability@v1',
          request_id: 'req-narr-unified',
          trace_id: 'req-narr-unified',
          generated_at: '2026-01-16T12:00:00.000Z',
          decision_trace: [],
          grounded_factors: [],
          integrity: {
            traceability_valid: true,
            physical_evidence_complete: true,
            narrative_anchored: true,
            drift_violations: [],
          },
        },
      }),
    } as unknown as DecisionExplainForHumanSkill;

    const svc = new ClaudeNarratorAgentService(undefined, skill);
    const itinerary = {
      request_id: 'req-narr-unified',
      days: [{ date: '2026-01-16', items: [] }],
    } as Itinerary;
    const state = {
      request_id: 'req-narr-unified',
      kernel_optimization_hints: hints,
    } as OrchestratorState;

    const narration = await svc.narrate(itinerary, allowGate(), orchLog, state);

    expect(skill.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        orchestrationDecisionLog: orchLog,
        requestId: 'req-narr-unified',
      }),
    );
    expect(narration.unified_explainability?.contract_version).toBe('unified-explainability@v1');
    expect(narration.guardian_narrative_zh?.abu).toBe('Abu skill section');
    expect(narration.user_friendly_summary).toContain('Abu skill section');
  });
});
