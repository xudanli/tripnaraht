import type { Itinerary } from '../../agent/interfaces/trip-plan.interface';
import { createSafeTravelEvidence } from './safetravel-verify-evidence.util';
import {
  VERIFY_SHADOW_CLOSURE_PROPAGATION_V0,
  aggregateAlertsByAffectedRef,
  applySafetravelClosureShadowReadOnlyPhase,
  propagateClosureIslandSkeleton,
  severityFromSafetravelAlert,
} from './temporal-shadow-closure.util';

describe('temporal-shadow-closure (Verify V2)', () => {
  it('propagateClosureIslandSkeleton forwards cut_points unchanged', () => {
    const itinerary = { request_id: 't1', days: [{ date: '2026-08-01', items: [] }] } as Itinerary;
    const cp = [{ dayIndex: 0, route_segment_ref: 'ring-road:south', severity: 'WARNING' as const }];
    const out = propagateClosureIslandSkeleton({
      itinerary,
      critical_segment_refs_by_day: new Map([[0, new Set(['ring-road:south'])]]),
      cut_points: cp,
    });
    expect(out.cutPoints).toEqual(cp);
    expect(out.default_suggested_mode).toBe('TEMPORARY_STAY');
  });

  it('aggregateAlertsByAffectedRef merges severity upward on same ref', () => {
    const m = aggregateAlertsByAffectedRef([
      {
        summary: 'wind',
        affected_route_segment_refs: ['seg-a'],
        severity: 'warning',
        id: 'a1',
      },
      {
        summary: 'closed',
        affected_route_segment_refs: ['seg-a'],
        severity: 'critical',
        id: 'a2',
      },
    ]);
    expect(m.get('seg-a')?.severity).toBe('CRITICAL');
    expect(m.get('seg-a')?.ids).toEqual(['a1', 'a2']);
  });

  it('applySafetravelClosureShadowReadOnlyPhase marks matching legs + verify_shadow', () => {
    const ev = createSafeTravelEvidence({ segmentRef: 'ring-road:vik-jokulsarlon', severity: 'critical' });
    const itinerary = {
      request_id: 'lifeline',
      days: [
        {
          date: '2026-08-01',
          items: [
            {
              id: 'drive1',
              type: 'DRIVE',
              start_window: '09:00',
              end_window: '12:00',
              location_ref: { name: 'Vík → Jökulsárlón' },
              evidence_refs: [],
              verified: false,
              metadata: { route_segment_ref: 'ring-road:vik-jokulsarlon' },
            },
          ],
        },
      ],
    } as Itinerary;

    const out = applySafetravelClosureShadowReadOnlyPhase(itinerary, {
      ...ev,
    } as Record<string, unknown>);

    const item = itinerary.days[0].items[0];
    expect(item.metadata?.closure_shadow?.cut_point).toBe(true);
    expect(item.metadata?.closure_shadow?.alert_severity).toBe('CRITICAL');
    expect(out.cutPoints).toEqual([
      { dayIndex: 0, route_segment_ref: 'ring-road:vik-jokulsarlon', severity: 'CRITICAL' },
    ]);
    const snap = itinerary.metadata?.verify_shadow?.[VERIFY_SHADOW_CLOSURE_PROPAGATION_V0] as {
      cutPoints: typeof out.cutPoints;
    };
    expect(snap?.cutPoints?.length).toBe(1);
  });

  it('clears stale closure_shadow when alerts are removed', () => {
    const itinerary = {
      request_id: 'r2',
      days: [
        {
          date: '2026-08-01',
          items: [
            {
              id: 'drive1',
              type: 'DRIVE',
              start_window: '09:00',
              end_window: '12:00',
              location_ref: { name: 'A' },
              evidence_refs: [],
              verified: false,
              metadata: { route_segment_ref: 'ring-road:x', closure_shadow: { cut_point: true } },
            },
          ],
        },
      ],
    } as Itinerary;

    applySafetravelClosureShadowReadOnlyPhase(itinerary, undefined);
    expect(itinerary.days[0].items[0].metadata?.closure_shadow).toBeUndefined();
  });
});

describe('severityFromSafetravelAlert', () => {
  it('maps high to ERROR', () => {
    expect(
      severityFromSafetravelAlert({
        summary: 's',
        affected_route_segment_refs: [],
        severity: 'high',
      }),
    ).toBe('ERROR');
  });
});
