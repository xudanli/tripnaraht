import { CausalTraceStaleError } from '../errors/causal-trace-stale.error';
import { CAUSAL_TRACE_PROTOCOL_VERSION } from '../causal-trace-reference.types';
import { CanonicalCausalTraceService } from '../services/canonical-causal-trace.service';

/**
 * Work Package D — minimal harness for Canonical Causal Trace v1.
 * See ADR-CANONICAL-CAUSAL-TRACE-V1.md
 */
describe('Causal trace harness (WP-D)', () => {
  const prisma = {
    trip: {
      findUnique: jest.fn().mockResolvedValue({
        updatedAt: new Date('2026-07-06T10:00:00.000Z'),
        destination: 'IS',
      }),
    },
  } as unknown as ConstructorParameters<typeof CanonicalCausalTraceService>[0];

  let service: CanonicalCausalTraceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CanonicalCausalTraceService(prisma);
  });

  it('Trace continuity — problem, preview, selected, executed share traceId', async () => {
    const trace = await service.ensureProblemTrace({
      tripId: 'trip-1',
      problemId: 'problem-1',
      worldStateVersion: 'ws_v1',
      semanticKey: 'travel',
      diagnosticMessage: 'Reykjavik → Vik 46min',
    });
    const ref = service.toRef(trace);

    service.bindPreview({
      traceId: ref.traceId,
      optionId: 'depart_45min_earlier',
      problemId: 'problem-1',
    });
    service.bindSelected({
      traceId: ref.traceId,
      optionId: 'depart_45min_earlier',
      executionRef: 'resolution-1',
    });
    service.bindExecuted({ traceId: ref.traceId, executionRef: 'resolution-1' });

    const final = service.getTrace(ref.traceId);
    expect(final?.traceId).toBe(ref.traceId);
    expect(final?.status).toBe('EXECUTED');
    expect(final?.selectedOptionId).toBe('depart_45min_earlier');
  });

  it('Snapshot stale — world version change blocks execute', async () => {
    const trace = await service.ensureProblemTrace({
      tripId: 'trip-1',
      problemId: 'problem-1',
      worldStateVersion: 'ws_preview',
      semanticKey: 'travel',
    });
    const ref = {
      traceId: trace.traceId,
      worldStateVersion: 'ws_preview',
      protocolVersion: CAUSAL_TRACE_PROTOCOL_VERSION,
    };

    expect(() =>
      service.assertExecuteAllowed({
        ref,
        problemId: 'problem-1',
        optionId: 'depart_45min_earlier',
        currentWorldStateVersion: 'ws_newer',
      }),
    ).toThrow(CausalTraceStaleError);
  });

  it('Basis replay — trace retains Iceland wind fact and P90 effect', async () => {
    const trace = await service.ensureProblemTrace({
      tripId: 'trip-1',
      problemId: 'problem-iceland',
      worldStateVersion: 'ws_v1',
      semanticKey: 'travel',
      diagnosticMessage: 'Reykjavik → Vik 46min',
      destination: 'IS',
    });

    expect(trace.facts.some((f) => f.factType === 'WEATHER_WIND_GUST')).toBe(true);
    expect(trace.effects.some((e) => e.effectType === 'SEGMENT_TRAVEL_TIME_P90')).toBe(true);
    expect(trace.problems[0]?.problemId).toBe('problem-iceland');

    const replayed = service.getTrace(trace.traceId);
    expect(replayed?.facts).toEqual(trace.facts);
    expect(replayed?.effects).toEqual(trace.effects);
  });

  it('Outcome binding — executionRef written on bindExecuted', async () => {
    const trace = await service.ensureProblemTrace({
      tripId: 'trip-1',
      problemId: 'problem-1',
      worldStateVersion: 'ws_v1',
    });
    service.bindSelected({
      traceId: trace.traceId,
      optionId: 'opt_a',
      executionRef: 'res-42',
    });
    service.bindExecuted({ traceId: trace.traceId, executionRef: 'res-42' });

    expect(service.getTrace(trace.traceId)?.executionRef).toBe('res-42');
    expect(service.getTrace(trace.traceId)?.status).toBe('EXECUTED');
  });

  it('Calibration — bindCalibrated sets CALIBRATED status and OUTCOME-ready calibration', async () => {
    const trace = await service.ensureProblemTrace({
      tripId: 'trip-1',
      problemId: 'problem-1',
      worldStateVersion: 'ws_v1',
      semanticKey: 'travel',
    });
    service.bindExecuted({ traceId: trace.traceId, executionRef: 'res-99' });
    service.bindCalibrated({
      traceId: trace.traceId,
      outcomeRef: 'res-99',
      predictedMinutes: 48,
      actualMinutes: 61,
      verdict: 'PARTIAL_MATCH',
    });
    const final = service.getTrace(trace.traceId);
    expect(final?.status).toBe('CALIBRATED');
    expect(final?.calibration?.predictionErrorMinutes).toBe(13);
  });
});
