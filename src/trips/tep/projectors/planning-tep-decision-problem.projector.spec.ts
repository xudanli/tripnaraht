import type { SelfDriveProfile } from '../contracts/tep-self-drive.types';
import { RECOVERY_GRAPH_SCHEMA } from '../contracts/tep-self-drive.types';
import { validateTepPlanningSnapshot } from '../validation/tep-validator';
import {
  projectLocalRepairPreviews,
  projectRecoveryGraph,
} from './recovery-graph.projector';
import { projectPlanningTepDecisionProblems } from './planning-tep-decision-problem.projector';

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

describe('planning-tep-decision-problem.projector', () => {
  it('projects reason + impact + options from SDR-101 repair previews (IS-CERT-101)', () => {
    const tripId = 'cert_101';
    const assessment = validateTepPlanningSnapshot({
      tripId,
      countryCode: 'IS',
      profile: cert101Profile,
      dailyDrivePlans: cert101Plans,
    });

    expect(assessment.status).toBe('REQUIRES_REPAIR');

    const recoveryGraph = projectRecoveryGraph({
      tripId,
      countryCode: 'IS',
      profile: cert101Profile,
      dailyDrivePlans: cert101Plans,
      ruleResults: assessment.ruleResults,
    });

    const repairPreviews = projectLocalRepairPreviews({
      tripId,
      countryCode: 'IS',
      profile: cert101Profile,
      dailyDrivePlans: cert101Plans,
      recoveryGraph,
      assessmentStatus: assessment.status,
    });

    const problems = projectPlanningTepDecisionProblems({
      tripId,
      assessmentStatus: assessment.status,
      ruleResults: assessment.ruleResults,
      recoveryGraph,
      repairPreviews,
    });

    expect(problems).toHaveLength(1);
    const problem = problems[0]!;
    expect(problem.phase).toBe('PLANNING');
    expect(problem.triggerRuleIds).toContain('SDR-101');
    expect(problem.reason).toMatch(/负荷|SDR-101/i);
    expect(problem.impact.statusBefore).toBe('REQUIRES_REPAIR');
    expect(problem.impact.statusAfter).not.toBe('REQUIRES_REPAIR');
    expect(problem.options.length).toBeGreaterThan(0);
    expect(problem.recommendedOptionId).toMatch(/^REPAIR-SDR101/);
    expect(problem.options.some((o) => o.recommended)).toBe(true);
  });

  it('returns [] when no repair previews', () => {
    const problems = projectPlanningTepDecisionProblems({
      tripId: 'trip_ok',
      assessmentStatus: 'EXECUTABLE',
      ruleResults: [],
      recoveryGraph: {
        schemaId: RECOVERY_GRAPH_SCHEMA,
        tripId: 'trip_ok',
        removableNodes: [],
        movableNodes: [],
        replaceableNodes: [],
        protectedNodes: [],
        dependencies: [],
        fallbackOptions: [],
      },
      repairPreviews: [],
    });
    expect(problems).toEqual([]);
  });
});
