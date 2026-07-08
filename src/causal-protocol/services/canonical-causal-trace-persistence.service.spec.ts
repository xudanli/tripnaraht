import { CanonicalCausalTracePersistenceService } from './canonical-causal-trace-persistence.service';
import { CanonicalCausalTraceStore } from './canonical-causal-trace.store';
import {
  CANONICAL_CAUSAL_TRACE_SCHEMA,
  type CanonicalCausalTraceV1,
} from '../causal-trace.types';

describe('CanonicalCausalTracePersistenceService', () => {
  const tripId = 'trip-persist-1';
  const trace: CanonicalCausalTraceV1 = {
    schema: CANONICAL_CAUSAL_TRACE_SCHEMA,
    traceId: 'ct_persist001',
    tripId,
    worldStateVersion: 'ws_v1',
    createdAt: '2026-07-06T10:00:00.000Z',
    updatedAt: '2026-07-06T10:00:00.000Z',
    trigger: {
      type: 'DECISION_PROBLEM_OPEN',
      source: 'GATEWAY_ASSERTION',
      observedAt: '2026-07-06T10:00:00.000Z',
    },
    facts: [],
    effects: [],
    problems: [{ problemId: 'problem-1', severity: 'WARNING' }],
    options: [],
    status: 'PREVIEW',
  };

  let metadata: Record<string, unknown>;
  let prisma: {
    trip: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let service: CanonicalCausalTracePersistenceService;

  beforeEach(() => {
    metadata = {};
    prisma = {
      trip: {
        findUnique: jest.fn(async () => ({ metadata })),
        update: jest.fn(async ({ data }: { data: { metadata: unknown } }) => {
          metadata = data.metadata as Record<string, unknown>;
          return { id: tripId };
        }),
      },
    };
    service = new CanonicalCausalTracePersistenceService(prisma as never);
  });

  it('upsertTrace writes to trip.metadata.canonicalCausalTracesV1', async () => {
    await service.upsertTrace(trace);

    const block = metadata.canonicalCausalTracesV1 as { traces: CanonicalCausalTraceV1[] };
    expect(block.traces).toHaveLength(1);
    expect(block.traces[0]?.traceId).toBe('ct_persist001');
    expect(prisma.trip.update).toHaveBeenCalled();
  });

  it('hydrateTrip loads persisted traces into store', async () => {
    await service.upsertTrace(trace);

    const store = new CanonicalCausalTraceStore();
    const freshService = new CanonicalCausalTracePersistenceService(prisma as never);
    await freshService.hydrateTrip(tripId, store);

    expect(store.get('ct_persist001')?.traceId).toBe('ct_persist001');
    expect(store.getActiveTraceId(tripId, 'problem-1')).toBe('ct_persist001');
  });

  it('upsertTrace replaces trace with same traceId', async () => {
    await service.upsertTrace(trace);
    await service.upsertTrace({
      ...trace,
      status: 'EXECUTED',
      updatedAt: '2026-07-06T11:00:00.000Z',
    });

    const block = metadata.canonicalCausalTracesV1 as { traces: CanonicalCausalTraceV1[] };
    expect(block.traces).toHaveLength(1);
    expect(block.traces[0]?.status).toBe('EXECUTED');
  });

  it('upsertTrace merges CALIBRATED over late EXECUTED write', async () => {
    const executed: CanonicalCausalTraceV1 = {
      ...trace,
      traceId: 'ct_merge',
      status: 'EXECUTED',
      updatedAt: '2026-07-06T15:20:00.000Z',
    };
    const calibrated: CanonicalCausalTraceV1 = {
      ...executed,
      status: 'CALIBRATED',
      updatedAt: '2026-07-06T15:19:00.000Z',
      calibration: {
        outcomeRef: 'res-1',
        verdict: 'CONFIRMED',
        evaluatedAt: '2026-07-06T15:19:00.000Z',
      },
    };
    await service.upsertTrace(executed);
    await service.upsertTrace(calibrated);

    const block = metadata.canonicalCausalTracesV1 as { traces: CanonicalCausalTraceV1[] };
    const stored = block.traces.find((t) => t.traceId === 'ct_merge');
    expect(stored?.status).toBe('CALIBRATED');
    expect(stored?.calibration?.verdict).toBe('CONFIRMED');
  });
});
