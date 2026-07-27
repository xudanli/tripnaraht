import {
  classifyAgenticToolSideEffect,
  isAgenticSideEffectReadOnly,
} from './agentic-tool-side-effect.util';
import {
  evaluateAgenticToolMutationGate,
  scanAgenticTraceForMutationTools,
} from './agentic-mutation-commit.adapter';
import { applyAgenticRouteAndRunMutationGuard } from './agentic-route-and-run-mutation.adapter';
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../../agent/dto/route-and-run.dto';

describe('agentic-tool-side-effect + mutation gate', () => {
  const prevGuard = process.env.AGENTIC_MUTATION_WRITE_GUARD;

  beforeEach(() => {
    process.env.AGENTIC_MUTATION_WRITE_GUARD = 'ENFORCE';
  });

  afterEach(() => {
    if (prevGuard === undefined) delete process.env.AGENTIC_MUTATION_WRITE_GUARD;
    else process.env.AGENTIC_MUTATION_WRITE_GUARD = prevGuard;
  });

  it('classifies weather as READ_EXTERNAL', () => {
    expect(classifyAgenticToolSideEffect('weather.getForecast')).toBe('READ_EXTERNAL');
    expect(isAgenticSideEffectReadOnly('READ_EXTERNAL')).toBe(true);
  });

  it('classifies itinerary update as TRIP_MUTATION', () => {
    expect(classifyAgenticToolSideEffect('trip.itinerary.update')).toBe('TRIP_MUTATION');
  });

  it('blocks TRIP_MUTATION without MutationAuthorityEnvelope at dispatch', () => {
    const gate = evaluateAgenticToolMutationGate({
      mcpToolName: 'trip.itinerary.apply_repair',
      tripId: 'trip_1',
    });
    expect(gate.allowed).toBe(false);
    expect(gate.holdEnvelope?.error).toBe('MUTATION_AUTHORITY_DENIED');
    expect(gate.reasonCodes).toContain('MUTATION_DENIED_DECISION_AUTHORITY_MISSING');
  });

  it('blocks TRIP_MUTATION when envelope lacks Decision ID (Authority Consistency)', () => {
    const gate = evaluateAgenticToolMutationGate({
      mcpToolName: 'trip.itinerary.update',
      tripId: 'trip_1',
      mutationAuthorityEnvelope: {
        tripId: 'trip_1',
        decisionId: '',
        expectedTripVersion: 3,
        constraintEvaluation: {
          evaluationId: 'eval_1',
          verdict: 'PASS',
          hardConstraintViolations: [],
        },
        evidenceSnapshot: {
          snapshotId: 'snap_1',
          capturedAt: new Date().toISOString(),
        },
        writeAuthority: { verdict: 'ALLOW', reasonCodes: [] },
        executionSource: { routeClass: 'FAST_PATH', orchestrationMode: 'Agentic' },
      },
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reasonCodes).toContain('MUTATION_DENIED_DECISION_AUTHORITY_MISSING');
  });

  it('allows READ_EXTERNAL tools without envelope', () => {
    const gate = evaluateAgenticToolMutationGate({
      mcpToolName: 'weather.getForecast',
      tripId: 'trip_1',
    });
    expect(gate.allowed).toBe(true);
  });

  it('denies UNKNOWN tools by default under ENFORCE', () => {
    const gate = evaluateAgenticToolMutationGate({
      mcpToolName: 'vendor.custom.doSomething',
      tripId: 'trip_1',
    });
    expect(gate.allowed).toBe(false);
    expect(gate.sideEffect).toBe('UNKNOWN');
  });

  it('applyAgenticRouteAndRunMutationGuard blocks when mutation executed without envelope', () => {
    const request = {
      request_id: 'r1',
      user_id: 'u1',
      trip_id: 'trip_1',
      message: '改行程',
    } as RouteAndRunRequestDto;
    const response: RouteAndRunResponseDto = {
      request_id: 'r1',
      route: { route: 'SYSTEM2', confidence: 0.5, reasons: [] },
      result: { status: 'OK', answer_text: 'done', payload: {} as any },
      explain: { decision_log: [] },
      observability: {},
    };
    const trace = {
      steps: [
        {
          tool_results: [
            {
              tool_call_id: 'c1',
              envelope: {
                success: true,
                data: { mcpToolName: 'trip.itinerary.update' },
                error: null,
                sideEffects: {},
                confidence: 1,
              },
            },
          ],
        },
      ],
    };
    const guarded = applyAgenticRouteAndRunMutationGuard({ request, response, agenticTrace: trace });
    expect((guarded.result.payload as any)?.canonical_mutation_guard?.canCommit).toBe(false);
    expect((guarded.observability as any)?.authority_audit_v1?.mutationCommitted).toBe(true);
  });

  it('scanAgenticTraceForMutationTools detects blocked dispatch', () => {
    const scan = scanAgenticTraceForMutationTools({
      steps: [
        {
          tool_results: [
            {
              envelope: {
                success: false,
                data: { mcpToolName: 'trip.itinerary.update' },
                error: 'MUTATION_AUTHORITY_DENIED',
                sideEffects: {},
                confidence: 0,
              },
            },
          ],
        },
      ],
    });
    expect(scan.blockedMutationTools).toContain('trip.itinerary.update');
    expect(scan.hasSuccessfulMutation).toBe(false);
  });
});
