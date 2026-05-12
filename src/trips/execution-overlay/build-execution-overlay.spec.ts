import { buildExecutionOverlay } from './build-execution-overlay';
import type { TripPlan } from '../decision/plan-model';
import type { TimeDrift } from '../decision/temporal/time-drift.types';
import type { WorldConstraintStoreSnapshot } from '../../world/world-snapshot';

describe('buildExecutionOverlay', () => {
  it('fuses SEQUENCE drift as authoritative delay when present', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-01',
          timeSlots: [
            {
              id: 'slot-transport',
              time: '10:00',
              endTime: '12:00',
              title: 'Drive',
              type: 'transport',
              travelLegFromPrev: {
                mode: 'drive',
                from: { lat: 64, lng: -22 },
                to: { lat: 64.2, lng: -21.8 },
                durationMin: 90,
              },
            },
          ],
        },
      ],
    };
    const drifts: TimeDrift[] = [
      {
        id: 'd1',
        date: '2026-06-01',
        sourceSlotId: 'slot-transport',
        deltaMinutes: 25,
        confidence: 0.8,
        propagationPolicy: 'PROPAGATE_SEQUENCE',
        cause: { kind: 'ROUTE_EXECUTION_PHYSICS' },
      },
    ];
    const frames = buildExecutionOverlay({
      plan,
      weatherByDate: {},
      timeDrifts: drifts,
    });
    expect(frames).toHaveLength(1);
    expect(frames[0]?.schemaVersion).toBe('1');
    expect(frames[0]?.temporal.driftMinutes).toBe(25);
    expect(frames[0]?.temporal.unifiedDelayMinutes).toBe(25);
    expect(frames[0]?.unifiedDelayMinutes).toBe(25);
  });

  it('elevates to BLOCKED when weather HARD', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-02',
          timeSlots: [
            {
              id: 's1',
              time: '09:00',
              title: 'X',
              type: 'transport',
              travelLegFromPrev: {
                mode: 'drive',
                from: { lat: 64, lng: -22 },
                to: { lat: 64.1, lng: -21.9 },
                durationMin: 30,
              },
            },
          ],
        },
      ],
    };
    const frames = buildExecutionOverlay({
      plan,
      weatherByDate: {
        '2026-06-02': {
          violation: 'HARD',
          executionState: 'BLOCKED',
          executionQuality: {
            safeScore: 0,
            delayFactor: 2,
            visibilityPenalty: 1,
            fatigueCost: 0,
            riskBudget: 0,
          },
        },
      },
    });
    expect(frames[0]?.finalExecutionState).toBe('BLOCKED');
    expect(frames[0]?.weather.severity).toBe('BLOCKED');
  });

  it('merges world SSOT slot-level CLOSED into road.blocked', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-03',
          timeSlots: [
            {
              id: 'slot-road-test',
              time: '08:00',
              title: 'Drive',
              type: 'transport',
              travelLegFromPrev: {
                mode: 'drive',
                from: { lat: 64, lng: -22 },
                to: { lat: 64.1, lng: -21.9 },
                durationMin: 60,
              },
            },
          ],
        },
      ],
    };
    const worldConstraintSnapshot: WorldConstraintStoreSnapshot = {
      version: 1,
      lastUpdatedAt: 1,
      roads: {
        F208: {
          id: 'F208',
          type: 'ROAD',
          state: 'CLOSED',
          severity: 90,
          temporalScope: { start: '2026-01-01', end: '2026-01-01' },
          impactWeight: 1,
          version: 1,
          affectedSlotIds: ['slot-road-test'],
        },
      },
      weather: {},
      bookings: {},
    };
    const frames = buildExecutionOverlay({
      plan,
      weatherByDate: {},
      worldConstraintSnapshot,
    });
    expect(frames).toHaveLength(1);
    expect(frames[0]?.road.blocked).toBe(true);
    expect(frames[0]?.finalExecutionState).toBe('BLOCKED');
  });
});
