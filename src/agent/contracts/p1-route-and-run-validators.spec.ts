import { summarizeP1RouteAndRunValidation } from './p1-route-and-run-validators';

describe('p1-route-and-run-validators', () => {
  it('aggregates AO-04 and K3 on minimal orchestration envelope', () => {
    const decisionLog = [
      {
        request_id: 'r',
        step: 'GATE_EVAL',
        actor: 'Orchestrator',
        inputs_summary: 'g',
        outputs_summary: 'ok',
        evidence_refs: [] as string[],
        timestamp: '2026-03-28T12:00:00.000Z',
      },
    ];
    const body = {
      request_id: 'r',
      explain: { decision_log: decisionLog },
      result: {
        payload: {
          orchestrationResult: {
            decision_log: decisionLog,
            state: {
              request_id: 'r',
              current_step: 'GATE_EVAL',
              decision_log: decisionLog,
              errors: [],
              metadata: {
                started_at: '2026-03-28T12:00:00.000Z',
                last_updated_at: '2026-03-28T12:00:00.000Z',
              },
              gate_result: {
                gate_result: 'ALLOW',
                violations: [],
                required_adjustments: [],
                confidence: 1,
                evidence_refs: [],
              },
            },
            decision_log: decisionLog,
          },
        },
      },
    };
    const s = summarizeP1RouteAndRunValidation(body);
    expect(s.valid).toBe(true);
    expect(s.allErrors).toHaveLength(0);
  });

  it('aggregates AO-04 (todo + itinerary + BLOCK alternatives warning) with K3', () => {
    const decisionLog = [
      {
        request_id: 'r2',
        step: 'GATE_EVAL',
        actor: 'Gatekeeper',
        inputs_summary: 'g',
        outputs_summary: 'block',
        evidence_refs: ['ev:1'] as string[],
        timestamp: '2026-03-30T10:00:00.000Z',
      },
    ];
    const body = {
      request_id: 'r2',
      explain: { decision_log: decisionLog },
      result: {
        payload: {
          orchestrationResult: {
            decision_log: decisionLog,
            state: {
              request_id: 'r2',
              current_step: 'GATE_EVAL',
              decision_log: decisionLog,
              errors: [],
              metadata: {
                started_at: '2026-03-30T10:00:00.000Z',
                last_updated_at: '2026-03-30T10:00:00.000Z',
              },
              gate_result: {
                gate_result: 'BLOCK',
                violations: [{ type: 'REACHABILITY', severity: 'HARD', detail: 'x' }],
                required_adjustments: [],
                confidence: 0.2,
                evidence_refs: [],
              },
              alternatives: { alternative_pois: [], alternative_routes: [] },
              todo_verification_list: [
                { field: 'transport.segment_1', missing_reason: 'no data', required_skill: 'transport.search' },
              ],
              itinerary: {
                days: [
                  {
                    date: '2026-04-01',
                    items: [
                      {
                        type: 'POI',
                        evidence_refs: ['ev:poi'],
                        verified: false,
                        location_ref: { name: 'Test POI' },
                      },
                    ],
                  },
                ],
              },
            },
            decision_log: decisionLog,
          },
        },
      },
    };
    const s = summarizeP1RouteAndRunValidation(body);
    expect(s.valid).toBe(true);
    expect(s.ao04.warnings.some((w) => w.includes('alternatives'))).toBe(true);
    expect(s.allErrors).toHaveLength(0);
  });
});
