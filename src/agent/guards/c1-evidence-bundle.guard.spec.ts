import { RouteAndRunResponseAssemblerService } from '../services/route-and-run-response-assembler.service';
import { JepaProjectorService } from '../services/jepa-projector.service';

describe('C1 strict evidence bundle guard', () => {
  const prev = process.env.C1_STRICT_EVIDENCE_BUNDLE;
  afterEach(() => {
    if (prev === undefined) delete process.env.C1_STRICT_EVIDENCE_BUNDLE;
    else process.env.C1_STRICT_EVIDENCE_BUNDLE = prev;
  });

  it('fails when strict mode enabled and evidence bundle is FAILED', () => {
    process.env.C1_STRICT_EVIDENCE_BUNDLE = '1';
    const svc = new RouteAndRunResponseAssemblerService({ buildJePaPayload: () => undefined } as unknown as JepaProjectorService);

    const req: any = { request_id: 'req-eb', message: 'x', options: { dry_run: true } };
    const orchestrationResult: any = {
      success: true,
      answerText: 'ok',
      stepsExecuted: [{ stepId: 'DONE', success: true, duration: 1 }],
      totalDuration: 1,
      decisionLog: [],
      result: {
        state: {
          request_id: 'req-eb',
          current_step: 'DONE',
          decision_log: [],
          errors: [],
          evidence_registry: new Map(),
          metadata: { started_at: new Date().toISOString(), last_updated_at: new Date().toISOString() },
        },
        itinerary: { request_id: 'req-eb', days: [], action_plan: [] },
        gate_result: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.9, evidence_refs: [] },
      },
    };

    // With no hard facts + no evidence cards, bundle.verification_status becomes FAILED → strict must throw.
    expect(() =>
      svc.assembleClaudeStateMachineResponse({
        request: req,
        startTime: Date.now(),
        orchestrationResult,
      } as any),
    ).toThrow(/C1_STRICT_EVIDENCE_BUNDLE/);
  });
});

