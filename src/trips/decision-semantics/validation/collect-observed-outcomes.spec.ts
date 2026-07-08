import {
  collectObservedOutcomes,
  mergeObservedByMetric,
} from './collect-observed-outcomes.util';
import type { LightExecutionSignal } from './load-light-execution-observations.util';

describe('collect-observed-outcomes P2', () => {
  const baseReport = {
    verifiedAt: '2026-06-30T12:00:00Z',
    isStale: false,
    issues: [],
    verdict: { status: 'OK' },
    summary: { mustHandle: 0 },
  } as Parameters<typeof collectObservedOutcomes>[0]['report'];

  it('prefers USER_ARRIVAL_CLICK over SYSTEM_INFERENCE for ARRIVAL_TIME', () => {
    const signals: LightExecutionSignal[] = [
      {
        kind: 'user_arrival_click',
        observedAt: '2026-06-30T13:00:00Z',
        value: '14:30',
        rawSource: 'offline:poi_execution_feedback',
      },
    ];

    const observed = collectObservedOutcomes({
      report: baseReport,
      problemStillOpen: false,
      poiFeedbackRows: [],
      lightExecutionSignals: signals,
    });

    const arrival = observed.find((o) => o.metric === 'ARRIVAL_TIME');
    expect(arrival?.source).toBe('USER_ARRIVAL_CLICK');
    expect(arrival?.actualValue).toBe('14:30');
  });

  it('maps itinerary endTime to ITINERARY_ITEM_STATUS completion', () => {
    const signals: LightExecutionSignal[] = [
      {
        kind: 'itinerary_item_timing',
        observedAt: '2026-06-30T15:00:00Z',
        entityId: 'item_1',
        value: 'completed',
        rawSource: 'itinerary:endTime',
      },
    ];

    const observed = collectObservedOutcomes({
      report: baseReport,
      problemStillOpen: false,
      poiFeedbackRows: [],
      lightExecutionSignals: signals,
    });

    const completion = observed.find((o) => o.metric === 'ACTIVITY_COMPLETION');
    expect(completion?.source).toBe('ITINERARY_ITEM_STATUS');
    expect(completion?.actualValue).toBe(true);
  });

  it('mergeObservedByMetric keeps higher-confidence source', () => {
    const merged = mergeObservedByMetric([
      {
        metric: 'ACTIVITY_COMPLETION',
        actualValue: false,
        observedAt: '2026-06-30T10:00:00Z',
        source: 'POI_FEEDBACK',
        confidence: 0.75,
      },
      {
        metric: 'ACTIVITY_COMPLETION',
        actualValue: true,
        observedAt: '2026-06-30T11:00:00Z',
        source: 'BOOKING_CHECKIN',
        confidence: 0.78,
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('BOOKING_CHECKIN');
  });
});
