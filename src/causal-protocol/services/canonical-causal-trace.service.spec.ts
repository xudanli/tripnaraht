import { CausalTraceStaleError } from '../errors/causal-trace-stale.error';
import { CAUSAL_TRACE_PROTOCOL_VERSION } from '../causal-trace-reference.types';
import { CanonicalCausalTraceService } from './canonical-causal-trace.service';

describe('CanonicalCausalTraceService', () => {
  const prisma = {
    trip: {
      findUnique: jest.fn().mockResolvedValue({
        updatedAt: new Date('2026-07-06T10:00:00.000Z'),
        destination: 'Iceland',
      }),
    },
  } as unknown as ConstructorParameters<typeof CanonicalCausalTraceService>[0];

  let service: CanonicalCausalTraceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CanonicalCausalTraceService(prisma);
  });

  it('ensureProblemTrace reuses active trace when worldStateVersion matches', async () => {
    const first = await service.ensureProblemTrace({
      tripId: 'trip-1',
      problemId: 'problem-1',
      worldStateVersion: 'ws_v1',
      diagnosticMessage: 'Reykjavik → Vik 46min',
    });
    const second = await service.ensureProblemTrace({
      tripId: 'trip-1',
      problemId: 'problem-1',
      worldStateVersion: 'ws_v1',
      diagnosticMessage: 'Reykjavik → Vik 46min',
    });
    expect(second.traceId).toBe(first.traceId);
  });

  it('marks trace STALE when worldStateVersion changes', async () => {
    const first = await service.ensureProblemTrace({
      tripId: 'trip-1',
      problemId: 'problem-1',
      worldStateVersion: 'ws_v1',
    });
    const second = await service.ensureProblemTrace({
      tripId: 'trip-1',
      problemId: 'problem-1',
      worldStateVersion: 'ws_v2',
    });
    expect(second.traceId).not.toBe(first.traceId);
    expect(service.getTrace(first.traceId)?.status).toBe('STALE');
  });

  it('bindPreview → bindSelected → bindExecuted preserves traceId', async () => {
    const trace = await service.ensureProblemTrace({
      tripId: 'trip-1',
      problemId: 'problem-1',
      worldStateVersion: 'ws_v1',
    });
    service.bindPreview({
      traceId: trace.traceId,
      optionId: 'depart_45min_earlier',
      problemId: 'problem-1',
    });
    service.bindSelected({
      traceId: trace.traceId,
      optionId: 'depart_45min_earlier',
      executionRef: 'resolution-1',
    });
    service.bindExecuted({
      traceId: trace.traceId,
      executionRef: 'resolution-1',
    });
    const final = service.getTrace(trace.traceId);
    expect(final?.status).toBe('EXECUTED');
    expect(final?.selectedOptionId).toBe('depart_45min_earlier');
    expect(final?.executionRef).toBe('resolution-1');
  });

  it('assertExecuteAllowed rejects stale worldStateVersion', async () => {
    const trace = await service.ensureProblemTrace({
      tripId: 'trip-1',
      problemId: 'problem-1',
      worldStateVersion: 'ws_preview',
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

  it('iceland seed attaches wind fact and P90 effect', async () => {
    const trace = await service.ensureProblemTrace({
      tripId: 'trip-1',
      problemId: 'problem-iceland',
      worldStateVersion: 'ws_v1',
      diagnosticMessage: 'Reykjavik → Vik 46min',
      destination: 'Iceland',
      semanticKey: 'transport_buffer',
      dimension: 'TRAVEL',
    });
    expect(trace.facts.some((f) => f.factType === 'WEATHER_WIND_GUST')).toBe(true);
    expect(trace.effects.some((e) => e.effectType === 'SEGMENT_TRAVEL_TIME_P90')).toBe(true);
    expect(trace.problems[0]?.problemId).toBe('problem-iceland');
  });
});
