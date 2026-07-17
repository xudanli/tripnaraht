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

  it('Iceland seed attaches TravelCausalDecision; select → execute → calibrate reconciles', async () => {
    const trace = await service.ensureProblemTrace({
      tripId: 'trip-1',
      problemId: 'problem-wind',
      worldStateVersion: 'ws_v1',
      semanticKey: 'travel',
      diagnosticMessage: 'Reykjavik → Vik 130min',
      destination: 'IS',
      schedule: {
        plannedDepartureAt: '2026-07-17T12:00:00.000Z',
        checkInDeadlineAt: '2026-07-17T15:00:00.000Z',
        windOnsetAt: '2026-07-17T13:00:00.000Z',
        costImpactDoNothing: 160,
        recoverableStop: {
          activityId: 'act_waterfall',
          label: '瀑布',
          recoverMinutes: 40,
        },
      },
    });

    expect(trace.travelCausalDecision).toBeDefined();
    expect(trace.travelCausalDecision?.temporalForecast.interventionDeadline).toBeTruthy();
    expect(trace.options.length).toBeGreaterThanOrEqual(2);

    const optionId =
      trace.travelCausalDecision!.recommendation?.optionId ??
      trace.options[0]!.optionId;

    service.bindSelected({
      traceId: trace.traceId,
      optionId,
      executionRef: 'res-wind-1',
    });
    const selected = service.getTrace(trace.traceId);
    expect(selected?.travelCausalDecision?.outcome?.selectedOptionId).toBe(optionId);
    expect(selected?.travelCausalDecision?.outcome?.reconciliation).toBe('PENDING');

    // EXECUTE without observations → still PENDING
    service.bindExecuted({
      traceId: trace.traceId,
      executionRef: 'res-wind-1',
    });
    expect(service.getTrace(trace.traceId)?.travelCausalDecision?.outcome?.reconciliation).toBe(
      'PENDING',
    );

    const predictedMiss =
      selected!.travelCausalDecision!.outcome!.predictedOutcome.metrics?.iceland_miss_prob ??
      0.1;

    // CALIBRATE with aligned observation → CONFIRMED
    service.bindCalibrated({
      traceId: trace.traceId,
      outcomeRef: 'res-wind-1',
      predictedMinutes: 150,
      actualMinutes: 152,
      completed: true,
      actualOutcome: {
        completed: true,
        metrics: { iceland_miss_prob: predictedMiss },
        sources: ['BOOKING_CHECKIN'],
        observedAt: '2026-07-17T16:00:00.000Z',
      },
    });
    const calibrated = service.getTrace(trace.traceId);
    expect(calibrated?.status).toBe('CALIBRATED');
    expect(calibrated?.travelCausalDecision?.outcome?.reconciliation).toBe('CONFIRMED');
    expect(service.getTravelCausalDecision('trip-1', 'problem-wind')?.decisionId).toBe(
      'dec_problem-wind',
    );
  });
});
