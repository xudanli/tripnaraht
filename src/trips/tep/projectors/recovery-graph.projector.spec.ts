import type { SelfDriveProfile } from '../contracts/tep-self-drive.types';
import { validateTepPlanningSnapshot } from '../validation/tep-validator';
import {
  projectLocalRepairPreviews,
  projectRecoveryGraph,
  simulateLocalRepair,
} from './recovery-graph.projector';

/** IS-CERT-101 fixture — 单日等效负荷 340min → REQUIRES_REPAIR */
const cert101Profile: SelfDriveProfile = {
  vehicle: { vehicleType: '4WD', vehicleSource: 'EXPLORATION' },
  drivers: [{ driverId: 'primary', experienceLevel: 'EXPERIENCED' }],
  drivingPolicy: {
    nightDrivingAllowed: true,
    nightDrivingPreference: 'ALLOW_WITH_CAUTION',
  },
};

const cert101Plans = [
  {
    date: '2026-08-05',
    dayIndex: 1,
    origin: { ref: 'anchor_a', label: 'Reykjavik' },
    destination: { ref: 'anchor_b', label: 'Hofn' },
    legs: [
      {
        legId: 'drive_leg_1_1',
        fromRef: 'item_a',
        toRef: 'item_b',
        baseNavigationMinutes: 330,
        roadRefs: ['segment:cert_101:ring'],
        importance: 'RECOMMENDED' as const,
        flexibility: 'REMOVABLE' as const,
      },
    ],
    activities: [
      {
        ref: 'activity_stop_1',
        importance: 'OPTIONAL' as const,
        flexibility: 'REMOVABLE' as const,
        weatherSensitive: false,
        reservationRequired: false,
        durationMinutes: 30,
        bufferMinutes: 0,
      },
    ],
    buffers: [],
  },
];

describe('recovery-graph.projector', () => {
  it('classifies nodes and projects dependencies (IS-CERT-101)', () => {
    const assessment = validateTepPlanningSnapshot({
      tripId: 'cert_101',
      countryCode: 'IS',
      profile: cert101Profile,
      dailyDrivePlans: cert101Plans,
    });

    expect(assessment.status).toBe('REQUIRES_REPAIR');

    const graph = projectRecoveryGraph({
      tripId: 'cert_101',
      countryCode: 'IS',
      profile: cert101Profile,
      dailyDrivePlans: cert101Plans,
      ruleResults: assessment.ruleResults,
    });

    expect(graph.schemaId).toBe('tripnara/recovery_graph@v1');
    expect(graph.removableNodes).toContain('activity_stop_1');
    expect(graph.removableNodes).toContain('drive_leg_1_1');
    expect(graph.dependencies.length).toBeGreaterThan(0);
    expect(graph.dependencies.some((d) => d.kind === 'ROUTING')).toBe(true);

    const loadRepair = graph.fallbackOptions.find((o) => o.triggerRuleId === 'SDR-101');
    expect(loadRepair).toMatchObject({
      action: 'REMOVE',
      targetRefs: ['activity_stop_1', 'day_1'],
    });
    expect(loadRepair?.description).toContain('HIGH→MEDIUM');
    expect(graph.dependencyImpacts?.length).toBeGreaterThan(0);
  });

  it('simulates local repair: remove OPTIONAL stop → HIGH→MEDIUM (IS-CERT-101/302)', () => {
    const assessment = validateTepPlanningSnapshot({
      tripId: 'cert_101',
      countryCode: 'IS',
      profile: cert101Profile,
      dailyDrivePlans: cert101Plans,
    });

    const graph = projectRecoveryGraph({
      tripId: 'cert_101',
      countryCode: 'IS',
      profile: cert101Profile,
      dailyDrivePlans: cert101Plans,
      ruleResults: assessment.ruleResults,
    });

    const option = graph.fallbackOptions.find((o) => o.optionId.includes('activity_stop_1'));
    expect(option).toBeDefined();

    const preview = simulateLocalRepair({
      tripId: 'cert_101',
      countryCode: 'IS',
      profile: cert101Profile,
      dailyDrivePlans: cert101Plans,
      option: option!,
      statusBefore: assessment.status,
    });

    expect(preview).toMatchObject({
      minutesReleased: 40,
      loadTierBefore: 'HIGH',
      loadTierAfter: 'MEDIUM',
      statusBefore: 'REQUIRES_REPAIR',
      statusAfter: 'EXECUTABLE_WITH_CAUTION',
    });
  });

  it('returns repairPreviews when assessment is REQUIRES_REPAIR', () => {
    const assessment = validateTepPlanningSnapshot({
      tripId: 'cert_101',
      countryCode: 'IS',
      profile: cert101Profile,
      dailyDrivePlans: cert101Plans,
    });

    const graph = projectRecoveryGraph({
      tripId: 'cert_101',
      countryCode: 'IS',
      profile: cert101Profile,
      dailyDrivePlans: cert101Plans,
      ruleResults: assessment.ruleResults,
    });

    const previews = projectLocalRepairPreviews({
      tripId: 'cert_101',
      countryCode: 'IS',
      profile: cert101Profile,
      dailyDrivePlans: cert101Plans,
      recoveryGraph: graph,
      assessmentStatus: assessment.status,
    });

    expect(previews.length).toBeGreaterThan(0);
    expect(previews[0].statusAfter).not.toBe('REQUIRES_REPAIR');
  });

  it('marks fixed reservation activities as protected', () => {
    const graph = projectRecoveryGraph({
      tripId: 'cert_003',
      countryCode: 'IS',
      profile: cert101Profile,
      dailyDrivePlans: [
        {
          date: '2026-08-04',
          dayIndex: 1,
          origin: { ref: 'anchor_a', label: 'Hotel' },
          destination: { ref: 'anchor_b', label: 'Blue Lagoon' },
          legs: [],
          activities: [
            {
              ref: 'activity_item_b',
              importance: 'MANDATORY',
              flexibility: 'FIXED',
              weatherSensitive: false,
              reservationRequired: true,
              durationMinutes: 90,
              bufferMinutes: 0,
              fixedStartAt: '2026-08-04T16:00:00.000Z',
            },
          ],
          buffers: [],
        },
      ],
    });

    expect(graph.protectedNodes).toContain('activity_item_b');
    expect(graph.removableNodes).not.toContain('activity_item_b');
    expect(
      graph.dependencies.some(
        (d) => d.kind === 'RESERVATION' && d.toRef === 'activity_item_b',
      ),
    ).toBe(true);
  });
});
