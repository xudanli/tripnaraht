import { RouteAndRunResponseAssemblerService } from '../services/route-and-run-response-assembler.service';
import { JepaProjectorService } from '../services/jepa-projector.service';

describe('C1 strict evidence bundle guard', () => {
  const prev = process.env.C1_STRICT_EVIDENCE_BUNDLE;
  const mockTradeoffEngine = {
    buildNegotiation: jest.fn().mockResolvedValue(undefined),
  } as any;
  afterEach(() => {
    if (prev === undefined) delete process.env.C1_STRICT_EVIDENCE_BUNDLE;
    else process.env.C1_STRICT_EVIDENCE_BUNDLE = prev;
  });

  it('fails when strict mode enabled and evidence bundle is FAILED', async () => {
    process.env.C1_STRICT_EVIDENCE_BUNDLE = '1';
    const svc = new RouteAndRunResponseAssemblerService(
      { buildJePaPayload: () => undefined } as unknown as JepaProjectorService,
      mockTradeoffEngine,
      undefined,
    );

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
    const p = svc.assembleClaudeStateMachineResponse({
      request: req,
      startTime: Date.now(),
      orchestrationResult,
    } as any);
    await expect(p).rejects.toThrow(/C1_STRICT_EVIDENCE_BUNDLE/);
  });

  it('PT-hard: fails under strict when itinerary contains TRANSIT but no public_transport_v1 hard fact', async () => {
    process.env.C1_STRICT_EVIDENCE_BUNDLE = '1';
    const svc = new RouteAndRunResponseAssemblerService(
      { buildJePaPayload: () => undefined } as unknown as JepaProjectorService,
      mockTradeoffEngine,
      undefined,
    );

    const now = new Date().toISOString();
    const req: any = { request_id: 'req-pt', message: 'x', options: { dry_run: true } };
    const orchestrationResult: any = {
      success: true,
      answerText: 'ok',
      stepsExecuted: [{ stepId: 'DONE', success: true, duration: 1 }],
      totalDuration: 1,
      decisionLog: [],
      result: {
        state: {
          request_id: 'req-pt',
          current_step: 'DONE',
          decision_log: [],
          errors: [],
          evidence_registry: new Map(),
          narration: {
            user_friendly_summary: 'ok',
            day_by_day_narrative: [],
            highlights: [],
            tips: [],
            warnings: [
              {
                kind: 'iron_shield_evidence',
                rule_id: 'wind_speed_drive_limit_v1',
                severity: 'HARD',
                message: 'wind warning',
                evidence: { type: 'weather_physics', value_mps: 20, threshold_mps: 15, source: 'stub' },
              },
            ],
          },
          metadata: { started_at: now, last_updated_at: now },
        },
        itinerary: {
          request_id: 'req-pt',
          days: [
            {
              date: '2026-01-01',
              items: [
                {
                  id: 't1',
                  type: 'TRANSIT',
                  start_window: '10:00',
                  end_window: '10:30',
                  location_ref: { name: 'Metro', place_id: 'seg-1' },
                  evidence_refs: [],
                  verified: false,
                  verification_status: 'ASSUMPTION',
                },
              ],
            },
          ],
          action_plan: [],
        },
        gate_result: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.9, evidence_refs: [] },
      },
    };

    const p = svc.assembleClaudeStateMachineResponse({
      request: req,
      startTime: Date.now(),
      orchestrationResult,
    } as any);
    await expect(p).rejects.toThrow(/C1_STRICT_EVIDENCE_BUNDLE/);
  });

  it('Environment hard facts: precipitation_limit_v1 violation forces FAIL under strict', async () => {
    process.env.C1_STRICT_EVIDENCE_BUNDLE = '1';
    const svc = new RouteAndRunResponseAssemblerService(
      { buildJePaPayload: () => undefined } as unknown as JepaProjectorService,
      mockTradeoffEngine,
      undefined,
    );

    const now = new Date().toISOString();
    const req: any = { request_id: 'req-env-precip', message: 'x', options: { dry_run: true } };

    const orchestrationResult: any = {
      success: true,
      answerText: 'ok',
      stepsExecuted: [{ stepId: 'DONE', success: true, duration: 1 }],
      totalDuration: 1,
      decisionLog: [],
      result: {
        state: {
          request_id: 'req-env-precip',
          current_step: 'DONE',
          decision_log: [],
          errors: [],
          evidence_registry: new Map(),
          metadata: { started_at: now, last_updated_at: now },
          narration: {
            user_friendly_summary: 'ok',
            day_by_day_narrative: [],
            highlights: [],
            tips: [],
            warnings: [],
          },
          // Inject violated env hard facts via VERIFY assertions_triggered.
          verification: {
            assertions_triggered: [
              {
                rule_id: 'precipitation_limit_v1',
                severity: 'HARD',
                is_violated: true,
                evidence: { type: 'weather_physics' },
              },
            ],
          },
        },
        itinerary: {
          request_id: 'req-env-precip',
          days: [
            {
              date: '2026-01-01',
              items: [
                {
                  id: 'd1',
                  type: 'DRIVE',
                  start_window: '10:00',
                  end_window: '10:30',
                  location_ref: { name: 'F-road segment', place_id: 'seg-1' },
                  evidence_refs: [],
                  verified: false,
                  verification_status: 'ASSUMPTION',
                },
              ],
            },
          ],
          action_plan: [],
        },
        gate_result: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.9, evidence_refs: [] },
      },
    };

    const p = Promise.resolve().then(() =>
      svc.assembleClaudeStateMachineResponse({
        request: req,
        startTime: Date.now(),
        orchestrationResult,
      } as any),
    );
    await expect(p).rejects.toThrow(/C1_STRICT_EVIDENCE_BUNDLE/);
  });

  it('Environment hard facts: solar_safety_v1 violation forces FAIL under strict', async () => {
    process.env.C1_STRICT_EVIDENCE_BUNDLE = '1';
    const svc = new RouteAndRunResponseAssemblerService(
      { buildJePaPayload: () => undefined } as unknown as JepaProjectorService,
      mockTradeoffEngine,
      undefined,
    );

    const now = new Date().toISOString();
    const req: any = { request_id: 'req-env-solar', message: 'x', options: { dry_run: true } };

    const orchestrationResult: any = {
      success: true,
      answerText: 'ok',
      stepsExecuted: [{ stepId: 'DONE', success: true, duration: 1 }],
      totalDuration: 1,
      decisionLog: [],
      result: {
        state: {
          request_id: 'req-env-solar',
          current_step: 'DONE',
          decision_log: [],
          errors: [],
          evidence_registry: new Map(),
          metadata: { started_at: now, last_updated_at: now },
          narration: {
            user_friendly_summary: 'ok',
            day_by_day_narrative: [],
            highlights: [],
            tips: [],
            warnings: [],
          },
          verification: {
            assertions_triggered: [
              {
                rule_id: 'solar_safety_v1',
                severity: 'HARD',
                is_violated: true,
                evidence: { type: 'solar_safety', source: 'UNIT_TEST' },
              },
            ],
          },
        },
        itinerary: {
          request_id: 'req-env-solar',
          days: [
            {
              date: '2026-01-01',
              items: [
                {
                  id: 'd1',
                  type: 'ACTIVITY',
                  start_window: '10:00',
                  end_window: '10:30',
                  location_ref: { name: 'Activity', place_id: 'seg-1' },
                  evidence_refs: [],
                  verified: false,
                  verification_status: 'ASSUMPTION',
                },
              ],
            },
          ],
          action_plan: [],
        },
        gate_result: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.9, evidence_refs: [] },
      },
    };

    const p = Promise.resolve().then(() =>
      svc.assembleClaudeStateMachineResponse({
        request: req,
        startTime: Date.now(),
        orchestrationResult,
      } as any),
    );
    await expect(p).rejects.toThrow(/C1_STRICT_EVIDENCE_BUNDLE/);
  });

});

