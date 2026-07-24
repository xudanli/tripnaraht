import type { DailyDrivePlan } from '../contracts/tep-self-drive.types';
import {
  buildPlanDependencies,
} from '../utils/plan-dependency.builder';
import {
  buildSdr303DependencyImpacts,
  evaluateSdr303DependencyChain,
} from '../validation/sdr-303-dependency.evaluator';

const dayWithChain: DailyDrivePlan[] = [
  {
    date: '2026-08-05',
    dayIndex: 1,
    origin: { ref: 'anchor_a', label: 'A' },
    destination: { ref: 'anchor_b', label: 'B' },
    legs: [
      {
        legId: 'drive_leg_1_1',
        fromRef: 'item_a',
        toRef: 'activity_stop_1',
        baseNavigationMinutes: 120,
        roadRefs: ['segment:ring'],
        importance: 'RECOMMENDED',
        flexibility: 'REMOVABLE',
      },
      {
        legId: 'drive_leg_1_2',
        fromRef: 'activity_stop_1',
        toRef: 'accommodation_hotel',
        baseNavigationMinutes: 60,
        roadRefs: ['segment:ring'],
        importance: 'MANDATORY',
        flexibility: 'FIXED',
      },
    ],
    activities: [
      {
        ref: 'activity_stop_1',
        importance: 'OPTIONAL',
        flexibility: 'REMOVABLE',
        weatherSensitive: false,
        reservationRequired: false,
        durationMinutes: 30,
        bufferMinutes: 0,
      },
    ],
    accommodation: {
      ref: 'accommodation_hotel',
      latestArrival: '22:00',
    },
    buffers: [],
  },
];

describe('sdr-303-dependency.evaluator', () => {
  it('builds routing and accommodation dependencies', () => {
    const deps = buildPlanDependencies(dayWithChain);
    expect(deps.some((d) => d.kind === 'ROUTING')).toBe(true);
    expect(deps.some((d) => d.kind === 'ACCOMMODATION')).toBe(true);
  });

  it('summarizes downstream impact for removable nodes', () => {
    const deps = buildPlanDependencies(dayWithChain);
    const impacts = buildSdr303DependencyImpacts({
      dailyDrivePlans: dayWithChain,
      dependencies: deps,
    });

    const stopImpact = impacts.find((i) => i.nodeRef === 'activity_stop_1');
    expect(stopImpact?.downstreamRefs).toContain('drive_leg_1_2');
    expect(stopImpact?.downstreamRefs).toContain('accommodation_hotel');
  });

  it('returns PASS rule result with dependency count', () => {
    const results = evaluateSdr303DependencyChain({
      dailyDrivePlans: dayWithChain,
    });
    expect(results[0]).toMatchObject({
      ruleId: 'SDR-303',
      outcome: 'PASS',
    });
    expect(results[0]?.explanation).toContain('依赖链');
  });
});
