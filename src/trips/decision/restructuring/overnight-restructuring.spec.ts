import { buildOvernightRestructuringPressures } from './build-overnight-restructuring-pressure';
import { restructuringPressureApproved } from './overnight-restructuring-gates';
import type { TripPlan } from '../plan-model';
import type { LegTemporalSafetyAssessment } from '../temporal/leg-temporal-safety.types';
import type { TimeDrift } from '../temporal/time-drift.types';

describe('buildOvernightRestructuringPressures', () => {
  it('aggregates UNSAFE legs and SEQUENCE drift per date', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [{ day: 1, date: '2026-01-20', timeSlots: [] }],
      temporal: { timeDrifts: [], constraintEdges: [], emittedAt: new Date().toISOString() },
    };

    const legs: LegTemporalSafetyAssessment[] = [
      {
        date: '2026-01-20',
        legId: 'arrival:t1',
        estimatedArrivalTime: '18:00',
        safeArrival: false,
        severity: 'UNSAFE',
      },
    ];

    const drifts: TimeDrift[] = [
      {
        id: 'd1',
        date: '2026-01-20',
        sourceSlotId: 'a',
        deltaMinutes: 50,
        confidence: 0.9,
        propagationPolicy: 'PROPAGATE_SEQUENCE',
        cause: { kind: 'WEATHER_EXECUTION_QUALITY' },
      },
    ];

    const pressures = buildOvernightRestructuringPressures({
      plan,
      legTemporalSafetyAssessments: legs,
      timeDrifts: drifts,
      operationalDayWindow: {
        dayStart: '08:00',
        dayEnd: '21:00',
        violationCount: 0,
        outOfWindowSlotIds: [],
      },
    });

    expect(pressures).toHaveLength(1);
    expect(pressures[0]!.unsafeLegIds).toContain('arrival:t1');
    expect(pressures[0]!.downstreamShiftMinutes).toBe(50);
    expect(pressures[0]!.restructuringRecommended).toBe(true);
  });
});

describe('restructuringPressureApproved', () => {
  it('requires stronger signal than restructuringRecommended alone', () => {
    const weak = {
      date: '2026-01-20',
      unsafeLegIds: ['arrival:x'],
      downstreamShiftMinutes: 20,
      crossDaySpillMinutes: 10,
      operationalWindowViolations: 0,
      daylightCollapseSeverity: 'LOW' as const,
      restructuringRecommended: true,
    };
    expect(restructuringPressureApproved(weak)).toBe(false);

    const strong = { ...weak, daylightCollapseSeverity: 'HIGH' as const };
    expect(restructuringPressureApproved(strong)).toBe(true);
  });
});
