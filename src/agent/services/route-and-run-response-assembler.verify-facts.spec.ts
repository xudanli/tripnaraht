import { RouteAndRunResponseAssemblerService } from './route-and-run-response-assembler.service';
import { JepaProjectorService } from './jepa-projector.service';

describe('RouteAndRunResponseAssemblerService verification hard facts bridge', () => {
  it('should include verification.assertions_triggered in payload evidence_bundle.hard_facts', async () => {
    const svc = new RouteAndRunResponseAssemblerService(
      { buildJePaPayload: () => undefined } as unknown as JepaProjectorService,
      { buildNegotiation: jest.fn().mockResolvedValue(undefined) } as any,
      undefined,
    );

    const now = new Date().toISOString();
    const req: any = { request_id: 'req-verify-facts', message: 'plan', options: { dry_run: true } };
    const orchestrationResult: any = {
      success: true,
      answerText: 'ok',
      stepsExecuted: [{ stepId: 'VERIFY', success: true, duration: 1 }],
      totalDuration: 1,
      totalCost: 0,
      decisionLog: [],
      result: {
        state: {
          request_id: 'req-verify-facts',
          current_step: 'DONE',
          decision_log: [],
          errors: [],
          evidence_registry: new Map(),
          verification: {
            assertions_triggered: [
              {
                rule_id: 'solar_safety_v1',
                is_violated: true,
                severity: 'HARD',
                evidence: { type: 'solar_safety', source: 'VERIFY/SUNSET_BREACH' },
              },
            ],
          },
          metadata: { started_at: now, last_updated_at: now },
        },
        itinerary: {
          request_id: 'req-verify-facts',
          days: [{ date: '2026-01-01', items: [] }],
          action_plan: [],
        },
        gate_result: {
          gate_result: 'ALLOW',
          violations: [],
          required_adjustments: [],
          confidence: 0.9,
          evidence_refs: [],
        },
      },
    };

    const out = await svc.assembleClaudeStateMachineResponse({
      request: req,
      startTime: Date.now(),
      orchestrationResult,
    } as any);

    const facts = ((out as any)?.result?.payload?.evidence_bundle?.hard_facts ?? []) as any[];
    expect(facts.some((x) => x?.rule_id === 'solar_safety_v1' && x?.is_violated === true)).toBe(true);
    const cards = ((out as any)?.result?.payload?.decision_metadata?.evidence_cards ?? []) as any[];
    expect(cards.some((x) => x?.rule_id === 'solar_safety_v1' && x?.kind === 'iron_shield_evidence')).toBe(true);
  });
});
