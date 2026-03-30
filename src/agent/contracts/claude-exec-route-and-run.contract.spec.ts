import {
  countOrchestratorAlternatives,
  extractOrchestratorStateFromRouteAndRunResponse,
  validateAo04RouteAndRunContract,
} from './claude-exec-route-and-run.contract';

describe('claude-exec-route-and-run.contract (AO-04)', () => {
  function minimalValidEnvelope(state: Record<string, unknown>) {
    return {
      request_id: 'req-ao04',
      result: {
        status: 'OK',
        answer_text: '',
        payload: {
          orchestrationResult: {
            state: {
              request_id: 'req-ao04',
              current_step: 'GATE_EVAL',
              decision_log: [],
              errors: [],
              metadata: {
                started_at: '2026-03-28T00:00:00.000Z',
                last_updated_at: '2026-03-28T00:00:00.000Z',
              },
              ...state,
            },
          },
        },
      },
    };
  }

  it('extractOrchestratorStateFromRouteAndRunResponse returns nested state', () => {
    const body = minimalValidEnvelope({});
    expect(extractOrchestratorStateFromRouteAndRunResponse(body)?.request_id).toBe('req-ao04');
  });

  it('validateAo04RouteAndRunContract passes for minimal valid response', () => {
    const r = validateAo04RouteAndRunContract(minimalValidEnvelope({}));
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('validateAo04RouteAndRunContract requires decision_log and errors arrays', () => {
    const bad = minimalValidEnvelope({ decision_log: undefined, errors: undefined } as any);
    const r = validateAo04RouteAndRunContract(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('decision_log'))).toBe(true);
    expect(r.errors.some((e) => e.includes('errors'))).toBe(true);
  });

  it('validateAo04RouteAndRunContract validates gate_result shape when present', () => {
    const bad = minimalValidEnvelope({
      gate_result: { gate_result: 'ALLOW' },
    } as any);
    const r = validateAo04RouteAndRunContract(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('violations'))).toBe(true);
  });

  it('rejects gate_result.gate_result when not in claude_exec allowed set', () => {
    const bad = minimalValidEnvelope({
      gate_result: {
        gate_result: 'INVALID_STATUS',
        violations: [],
        required_adjustments: [],
      },
    } as any);
    const r = validateAo04RouteAndRunContract(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('must be one of'))).toBe(true);
    expect(r.errors.some((e) => e.includes('ADJUST_REQUIRED'))).toBe(true);
  });

  it('rejects gate_result.violations entries missing claude_exec §1 fields', () => {
    const bad = minimalValidEnvelope({
      gate_result: {
        gate_result: 'BLOCK',
        violations: [{ type: 'SAFETY', severity: 'HARD' }],
        required_adjustments: [],
      },
    } as any);
    const r = validateAo04RouteAndRunContract(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('violations[0].detail'))).toBe(true);
  });

  it('rejects gate_result.required_adjustments entries missing action or why', () => {
    const missingAction = minimalValidEnvelope({
      gate_result: {
        gate_result: 'BLOCK',
        violations: [{ type: 'X', severity: 'HARD', detail: 'd' }],
        required_adjustments: [{ why: 'reason' }],
      },
    } as any);
    expect(validateAo04RouteAndRunContract(missingAction).valid).toBe(false);

    const missingWhy = minimalValidEnvelope({
      gate_result: {
        gate_result: 'BLOCK',
        violations: [{ type: 'X', severity: 'HARD', detail: 'd' }],
        required_adjustments: [{ action: 'fix' }],
      },
    } as any);
    expect(validateAo04RouteAndRunContract(missingWhy).valid).toBe(false);
    expect(
      validateAo04RouteAndRunContract(missingWhy).errors.some((e) => e.includes('why')),
    ).toBe(true);
  });

  it('rejects gate_result.evidence_refs when not an array', () => {
    const bad = minimalValidEnvelope({
      gate_result: {
        gate_result: 'ALLOW',
        violations: [],
        required_adjustments: [],
        evidence_refs: 'not-array',
      },
    } as any);
    const r = validateAo04RouteAndRunContract(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('evidence_refs'))).toBe(true);
  });

  it('rejects gate_result.confidence when not a number', () => {
    const bad = minimalValidEnvelope({
      gate_result: {
        gate_result: 'ALLOW',
        violations: [],
        required_adjustments: [],
        confidence: 'high',
      },
    } as any);
    const r = validateAo04RouteAndRunContract(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('confidence'))).toBe(true);
  });

  it('warns on decision_log entries missing CLAUDE_EXEC §4 fields (non-blocking)', () => {
    const body = minimalValidEnvelope({
      decision_log: [{ step: 'GATE_EVAL', actor: 'Orchestrator' }],
    });
    const r = validateAo04RouteAndRunContract(body);
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.includes('decision_log[0]') && w.includes('timestamp'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('inputs_summary'))).toBe(true);
  });

  it('AO04_ROUTE_AND_RUN_STRICT merges warnings into errors', () => {
    process.env.AO04_ROUTE_AND_RUN_STRICT = '1';
    try {
      const body = minimalValidEnvelope({
        decision_log: [{ step: 'GATE_EVAL', actor: 'Orchestrator' }],
      });
      const r = validateAo04RouteAndRunContract(body);
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.startsWith('AO-04 strict:'))).toBe(true);
    } finally {
      delete process.env.AO04_ROUTE_AND_RUN_STRICT;
    }
  });

  it('warns on BLOCK without alternatives (CLAUDE_EXEC guidance)', () => {
    const body = minimalValidEnvelope({
      gate_result: {
        gate_result: 'BLOCK',
        violations: [{ type: 'SAFETY', severity: 'HARD', detail: 'x' }],
        required_adjustments: [],
        confidence: 0.5,
      },
      alternatives: undefined,
    });
    const r = validateAo04RouteAndRunContract(body);
    expect(r.valid).toBe(true);
    expect(r.warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('countOrchestratorAlternatives sums POI and route slots', () => {
    expect(
      countOrchestratorAlternatives({
        alternative_pois: [{ poi_id: '1', name: 'a', reason: 'r', evidence_status: 'VERIFIED' }],
        alternative_routes: [],
      }),
    ).toBe(1);
  });

  it('validates optional todo_verification_list when present on state', () => {
    const body = minimalValidEnvelope({
      todo_verification_list: [
        { field: 'hours', missing_reason: 'no data', required_skill: 'opening_hours.get' },
      ],
    });
    const r = validateAo04RouteAndRunContract(body);
    expect(r.valid).toBe(true);
  });

  it('rejects todo_verification_list item with non-string field', () => {
    const body = minimalValidEnvelope({
      todo_verification_list: [{ field: 1, missing_reason: 'x', required_skill: 'y' }],
    } as any);
    const r = validateAo04RouteAndRunContract(body);
    expect(r.valid).toBe(false);
  });

  it('validates itinerary.items evidence_refs and type when itinerary present', () => {
    const good = minimalValidEnvelope({
      itinerary: {
        request_id: 'r1',
        days: [
          {
            date: '2026-07-01',
            items: [
              {
                id: 'i1',
                type: 'POI',
                start_window: '10:00',
                end_window: '11:00',
                location_ref: { name: 'Museum' },
                evidence_refs: ['e1'],
                verified: false,
              },
            ],
          },
        ],
      },
    });
    expect(validateAo04RouteAndRunContract(good).valid).toBe(true);

    const bad = minimalValidEnvelope({
      itinerary: {
        request_id: 'r1',
        days: [{ date: '2026-07-01', items: [{ id: 'i1', type: 'POI', evidence_refs: 'nope' }] }],
      },
    } as any);
    expect(validateAo04RouteAndRunContract(bad).valid).toBe(false);
  });
});
