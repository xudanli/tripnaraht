import {
  actualOutcomeFromCheckIn,
  actualOutcomeFromGpsFix,
  actualOutcomeFromLightSignals,
  actualOutcomeFromObservedOutcomes,
} from './ingest-execution-observation.util';
import { applyObservationToCausalTrace } from './apply-observation-to-causal-trace.util';
import { CanonicalCausalTraceService } from '../../causal-protocol/services/canonical-causal-trace.service';
import { classifyOutcomeReconciliation } from '../reconciliation/reconcile-decision-outcome.util';

describe('execution observation ingest', () => {
  it('maps GPS fix to completed arrival', () => {
    const actual = actualOutcomeFromGpsFix({
      arrivedAt: '2026-07-17T14:30:00.000Z',
      lat: 63.4,
      lng: -19.0,
      accuracyM: 12,
      insideGeofence: true,
    });
    expect(actual.sources).toEqual(['GPS']);
    expect(actual.completed).toBe(true);
    expect(actual.arrivalTime).toBe('2026-07-17T14:30:00.000Z');
  });

  it('maps booking check-in', () => {
    const actual = actualOutcomeFromCheckIn({
      checkedInAt: '2026-07-17T14:35:00.000Z',
      bookingId: 'bk_1',
    });
    expect(actual.sources).toEqual(['BOOKING_CHECKIN']);
    expect(actual.completed).toBe(true);
  });

  it('prefers gps: light signal payload', () => {
    const actual = actualOutcomeFromLightSignals([
      {
        kind: 'user_arrival_click',
        observedAt: '2026-07-17T14:30:00.000Z',
        entityId: 'poi_1',
        value: JSON.stringify({ lat: 63.4, lng: -19, accuracyM: 8 }),
        rawSource: 'gps:gps_geofence_enter',
      },
    ]);
    expect(actual?.sources).toEqual(['GPS']);
    expect(actual?.metrics?.lat).toBe(63.4);
  });

  it('builds ActualOutcomeSnapshot from observed outcomes with GPS source', () => {
    const actual = actualOutcomeFromObservedOutcomes([
      {
        metric: 'ARRIVAL_TIME',
        actualValue: '2026-07-17T14:30:00.000Z',
        observedAt: '2026-07-17T14:30:00.000Z',
        source: 'GPS',
        confidence: 0.9,
      },
      {
        metric: 'ACTIVITY_COMPLETION',
        actualValue: true,
        observedAt: '2026-07-17T14:31:00.000Z',
        source: 'BOOKING_CHECKIN',
        confidence: 0.85,
      },
    ]);
    expect(actual?.completed).toBe(true);
    expect(actual?.sources).toEqual(expect.arrayContaining(['GPS', 'BOOKING_CHECKIN']));
  });

  it('applyObservationToCausalTrace reconciles Iceland seeded decision', async () => {
    const prisma = {
      trip: {
        findUnique: jest.fn().mockResolvedValue({
          updatedAt: new Date('2026-07-17T10:00:00.000Z'),
          destination: 'IS',
          metadata: {},
        }),
      },
    } as unknown as ConstructorParameters<typeof CanonicalCausalTraceService>[0];

    const service = new CanonicalCausalTraceService(prisma);
    const trace = await service.ensureProblemTrace({
      tripId: 'trip_obs',
      problemId: 'problem_obs',
      worldStateVersion: 'ws_v1',
      semanticKey: 'travel',
      destination: 'IS',
      diagnosticMessage: 'Reykjavik → Vik 90min',
    });
    expect(trace.travelCausalDecision).toBeDefined();

    const optionId = trace.travelCausalDecision!.recommendation!.optionId;
    service.bindSelected({
      traceId: trace.traceId,
      optionId,
      executionRef: 'res_obs',
    });
    service.bindExecuted({ traceId: trace.traceId, executionRef: 'res_obs' });

    const predicted =
      trace.travelCausalDecision!.outcome?.predictedOutcome ??
      trace.travelCausalDecision!.baselineOutcome;
    const predictedMiss = predicted.metrics?.iceland_miss_prob ?? 0.1;

    const updated = applyObservationToCausalTrace(service, {
      tripId: 'trip_obs',
      problemId: 'problem_obs',
      calibrate: true,
      outcomeRef: 'val_obs',
      actual: {
        completed: true,
        metrics: { iceland_miss_prob: predictedMiss },
        sources: ['GPS', 'BOOKING_CHECKIN'],
        observedAt: '2026-07-17T15:00:00.000Z',
      },
    });

    expect(updated?.outcome?.reconciliation).toBe('CONFIRMED');
    expect(
      classifyOutcomeReconciliation(predicted, updated!.outcome!.actualOutcome!).status,
    ).toBe('CONFIRMED');
  });
});
