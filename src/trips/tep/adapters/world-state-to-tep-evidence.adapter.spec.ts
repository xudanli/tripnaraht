import type { StoredRfc001WorldState } from '../../guardian-decision-core/evidence/world-state-store.service';
import type { DailyDrivePlan } from '../contracts/tep-self-drive.types';
import { validateTepPlanningSnapshot } from '../validation/tep-validator';
import {
  buildTepEvidenceFromWorldState,
  mapRoadAssertionsToConditions,
  projectScheduleArrivalsFromDailyPlans,
} from './world-state-to-tep-evidence.adapter';

const sampleDayPlan: DailyDrivePlan[] = [
  {
    date: '2026-08-03',
    dayIndex: 1,
    origin: { ref: 'anchor_a', label: 'A' },
    destination: { ref: 'anchor_b', label: 'B' },
    legs: [
      {
        legId: 'drive_leg_1_1',
        fromRef: 'item_a',
        toRef: 'item_b',
        baseNavigationMinutes: 90,
        roadRefs: ['segment:trip_ws:F208'],
        importance: 'RECOMMENDED',
        flexibility: 'REMOVABLE',
      },
    ],
    activities: [
      {
        ref: 'activity_item_b',
        importance: 'MANDATORY',
        flexibility: 'FIXED',
        weatherSensitive: false,
        reservationRequired: true,
        durationMinutes: 60,
        bufferMinutes: 0,
        fixedStartAt: '2026-08-03T16:00:00.000Z',
      },
    ],
    buffers: [],
  },
];

const baseProfile = {
  vehicle: { vehicleType: '4WD' as const, vehicleSource: 'EXPLORATION' as const },
  drivers: [{ driverId: 'primary', experienceLevel: 'EXPERIENCED' as const }],
  drivingPolicy: {
    nightDrivingAllowed: true,
    nightDrivingPreference: 'ALLOW_WITH_CAUTION' as const,
  },
};

describe('world-state-to-tep-evidence.adapter', () => {
  it('maps ACTIVE road.status assertions to plan roadRefs', () => {
    const store: StoredRfc001WorldState = {
      assertions: [
        {
          assertionId: 'wsa_1',
          subjectRef: { kind: 'ROUTE_SEGMENT', id: 'segment:trip_ws:F208' },
          predicate: 'road.status',
          payload: { roadId: 'F208', status: 'CLOSED' },
          source: { provider: 'ROAD_IS', sourceType: 'OFFICIAL', evidenceRefs: ['ev_1'] },
          observedAt: '2026-08-03T08:00:00.000Z',
          validFrom: '2026-08-03T08:00:00.000Z',
          validUntil: '2026-08-03T08:15:00.000Z',
          confidence: 0.95,
          status: 'ACTIVE',
          version: 1,
        },
      ],
      snapshots: [],
      events: [],
    };

    const conditions = mapRoadAssertionsToConditions({
      store,
      dailyDrivePlans: sampleDayPlan,
      now: new Date('2026-08-03T08:10:00.000Z'),
    });

    expect(conditions).toHaveLength(1);
    expect(conditions[0]).toMatchObject({
      roadRef: 'segment:trip_ws:F208',
      roadId: 'F208',
      status: 'CLOSED',
      degraded: false,
    });
  });

  it('marks expired road evidence as degraded UNKNOWN', () => {
    const store: StoredRfc001WorldState = {
      assertions: [
        {
          assertionId: 'wsa_expired',
          subjectRef: { kind: 'ROUTE_SEGMENT', id: 'segment:trip_ws:F208' },
          predicate: 'road.status',
          payload: { roadId: 'F208', status: 'OPEN' },
          source: { provider: 'ROAD_IS', sourceType: 'OFFICIAL', evidenceRefs: [] },
          observedAt: '2026-08-01T08:00:00.000Z',
          validFrom: '2026-08-01T08:00:00.000Z',
          validUntil: '2026-08-01T08:15:00.000Z',
          confidence: 0.9,
          status: 'ACTIVE',
          version: 1,
        },
      ],
      snapshots: [],
      events: [],
    };

    const evidence = buildTepEvidenceFromWorldState({
      store,
      dailyDrivePlans: sampleDayPlan,
      now: new Date('2026-08-03T10:00:00.000Z'),
    });

    expect(evidence.hasStaleEvidence).toBe(true);
    expect(evidence.roadConditions[0]?.status).toBe('UNKNOWN');
    expect(evidence.roadConditions[0]?.degraded).toBe(true);
  });

  it('merges execution slip over plan schedule arrivals', () => {
    const store: StoredRfc001WorldState = {
      assertions: [
        {
          assertionId: 'wsa_slip',
          subjectRef: { kind: 'PLAN_ITEM', id: 'item_a' },
          predicate: 'execution.departure_slip',
          payload: {
            factType: 'EXECUTION_DEPARTURE_SLIP',
            activityId: 'item_a',
            plannedDepartAt: '2026-08-03T14:00:00.000Z',
            observedAt: '2026-08-03T14:30:00.000Z',
            stillAtPoi: true,
            slipMinutes: 30,
            nextActivityId: 'item_b',
            projectedEta: '2026-08-03T17:00:00.000Z',
          },
          source: { provider: 'INTERNAL', sourceType: 'INTERNAL', evidenceRefs: [] },
          observedAt: '2026-08-03T14:30:00.000Z',
          validFrom: '2026-08-03T14:30:00.000Z',
          confidence: 0.8,
          status: 'ACTIVE',
          version: 1,
        },
      ],
      snapshots: [],
      events: [],
    };

    const evidence = buildTepEvidenceFromWorldState({
      store,
      dailyDrivePlans: sampleDayPlan,
    });

    const arrival = evidence.activityArrivals.find((a) => a.activityRef === 'activity_item_b');
    expect(arrival?.projectedArrivalAt).toBe('2026-08-03T17:00:00.000Z');
    expect(evidence.sources).toContain('execution.departure_slip');
  });

  it('recomputes assessment from WorldState without manual injection (WP-TEP-10)', () => {
    const prev = process.env.DECISION_PACK_RULES;
    process.env.DECISION_PACK_RULES = '1';

    try {
      const store: StoredRfc001WorldState = {
        assertions: [
          {
            assertionId: 'wsa_closed',
            subjectRef: { kind: 'ROUTE_SEGMENT', id: 'segment:trip_ws:F208' },
            predicate: 'road.status',
            payload: { roadId: 'F208', status: 'CLOSED' },
            source: { provider: 'ROAD_IS', sourceType: 'OFFICIAL', evidenceRefs: [] },
            observedAt: '2026-08-03T08:00:00.000Z',
            validFrom: '2026-08-03T08:00:00.000Z',
            validUntil: '2026-08-03T09:00:00.000Z',
            confidence: 1,
            status: 'ACTIVE',
            version: 1,
          },
        ],
        snapshots: [],
        events: [],
      };

      const evidence = buildTepEvidenceFromWorldState({
        store,
        dailyDrivePlans: sampleDayPlan,
        now: new Date('2026-08-03T08:30:00.000Z'),
      });

      const assessment = validateTepPlanningSnapshot({
        tripId: 'trip_ws',
        countryCode: 'IS',
        profile: baseProfile,
        dailyDrivePlans: sampleDayPlan,
        roadConditions: evidence.roadConditions,
        activityArrivals: evidence.activityArrivals,
      });

      expect(assessment.status).toBe('NOT_EXECUTABLE');
      expect(assessment.ruleResults.some((r) => r.ruleId === 'SDR-002')).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.DECISION_PACK_RULES;
      else process.env.DECISION_PACK_RULES = prev;
    }
  });

  it('always provides plan_schedule arrivals as baseline', () => {
    const schedule = projectScheduleArrivalsFromDailyPlans(sampleDayPlan);
    expect(schedule.length).toBeGreaterThan(0);

    const evidence = buildTepEvidenceFromWorldState({
      store: { assertions: [], snapshots: [], events: [] },
      dailyDrivePlans: sampleDayPlan,
    });

    expect(evidence.sources).toContain('plan_schedule');
    expect(evidence.activityArrivals.length).toBeGreaterThan(0);
  });
});
