import { CausalTraceStaleError } from '../errors/causal-trace-stale.error';
import { CAUSAL_TRACE_PROTOCOL_VERSION } from '../causal-trace-reference.types';
import { CANONICAL_CAUSAL_TRACE_SCHEMA } from '../causal-trace.types';
import { CanonicalCausalTraceService } from './canonical-causal-trace.service';
import type { CanonicalCausalTraceStore } from './canonical-causal-trace.store';

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
      semanticKey: 'transport_buffer',
    });
    const second = await service.ensureProblemTrace({
      tripId: 'trip-1',
      problemId: 'problem-1',
      worldStateVersion: 'ws_v1',
      diagnosticMessage: 'Reykjavik → Vik 46min',
      semanticKey: 'transport_buffer',
    });
    expect(second.traceId).toBe(first.traceId);
  });

  it('marks trace STALE when worldStateVersion changes', async () => {
    const first = await service.ensureProblemTrace({
      tripId: 'trip-1',
      problemId: 'problem-1',
      worldStateVersion: 'ws_v1',
      semanticKey: 'transport_buffer',
    });
    const second = await service.ensureProblemTrace({
      tripId: 'trip-1',
      problemId: 'problem-1',
      worldStateVersion: 'ws_v2',
      semanticKey: 'transport_buffer',
    });
    expect(second.traceId).not.toBe(first.traceId);
    expect(service.getTrace(first.traceId)?.status).toBe('STALE');
  });

  it('bindPreview → bindSelected → bindExecuted preserves traceId', async () => {
    const trace = await service.ensureProblemTrace({
      tripId: 'trip-1',
      problemId: 'problem-1',
      worldStateVersion: 'ws_v1',
      semanticKey: 'transport_buffer',
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
      semanticKey: 'transport_buffer',
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

  it('does not attach wind travel seed to DecisionCase vehicle problem', async () => {
    const trace = await service.ensureProblemTrace({
      tripId: 'trip-1',
      problemId: 'dc_vehicle_trip-1',
      worldStateVersion: 'ws_v1',
      destination: 'Iceland',
      semanticKey: 'REQUIRED_CHOICE.VEHICLE_ROAD_FIT',
      dimension: 'TRANSPORT',
      problemType: 'PREFERENCE_CONFLICT',
      diagnosticMessage: '车型待确认。路线草案生成后将补充 F-road 影响。',
    });
    expect(trace.facts.some((f) => f.factType === 'WEATHER_WIND_GUST')).toBe(false);
    expect(trace.effects.some((e) => e.effectType === 'SEGMENT_TRAVEL_TIME_P90')).toBe(false);
    expect(trace.problems[0]?.assessmentKey).toContain('车型');
  });

  it('rebuilds when an existing wind seed was wrongly bound to a DecisionCase', async () => {
    const store = (service as unknown as { store: CanonicalCausalTraceStore }).store;
    const now = new Date().toISOString();
    store.save({
      schema: CANONICAL_CAUSAL_TRACE_SCHEMA,
      traceId: 'ct_wrong_wind',
      tripId: 'trip-repair',
      worldStateVersion: 'ws_v1',
      createdAt: now,
      updatedAt: now,
      trigger: { type: 'DECISION_PROBLEM_OPEN', source: 'test', observedAt: now },
      facts: [
        {
          factId: 'fact_wind_x',
          factType: 'WEATHER_WIND_GUST',
          subjectType: 'SEGMENT',
          subjectId: 'seg',
          observedAt: now,
          source: 'test',
          confidence: 0.9,
          attributes: { windMps: 12, routeLabel: '冰岛路段' },
        },
      ],
      effects: [
        {
          effectId: 'effect_p90_x',
          causeFactIds: ['fact_wind_x'],
          effectType: 'SEGMENT_TRAVEL_TIME_P90',
          affectedEntityType: 'SEGMENT',
          affectedEntityId: 'seg',
          previousValue: 46,
          predictedValue: 83,
          propagationRuleId: 'iceland.wind_to_p90',
          confidence: 0.85,
        },
      ],
      problems: [
        {
          problemId: 'dc_vehicle_trip-repair',
          problemType: 'PREFERENCE_CONFLICT',
          severity: 'BLOCKER',
          assessmentKey: 'wrong wind',
        },
      ],
      options: [],
      status: 'PREVIEW',
    });

    const repaired = await service.ensureProblemTrace({
      tripId: 'trip-repair',
      problemId: 'dc_vehicle_trip-repair',
      worldStateVersion: 'ws_v1',
      semanticKey: 'REQUIRED_CHOICE.VEHICLE_ROAD_FIT',
      dimension: 'TRANSPORT',
      diagnosticMessage: '车型与路况匹配待确认',
    });

    expect(repaired.traceId).not.toBe('ct_wrong_wind');
    expect(repaired.facts.some((f) => f.factType === 'WEATHER_WIND_GUST')).toBe(false);
    expect(service.getTrace('ct_wrong_wind')?.status).toBe('STALE');
  });
});
