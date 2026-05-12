import { collectOvernightRestructuringProposals } from './collect-overnight-restructuring-proposals';
import type { OvernightRestructuringPressure } from './overnight-restructuring.types';
import type { LegTemporalSafetyAssessment } from '../temporal/leg-temporal-safety.types';
import { evaluateMinimalRepairs } from '../repair/repair-evaluator';
import type { TripPlan } from '../plan-model';

describe('collectOvernightRestructuringProposals', () => {
  it('prefers RELOCATE_OVERNIGHT when cross-day spill is large', () => {
    const pressures: OvernightRestructuringPressure[] = [
      {
        date: '2026-02-10',
        unsafeLegIds: ['arrival:t1'],
        downstreamShiftMinutes: 20,
        crossDaySpillMinutes: 50,
        operationalWindowViolations: 0,
        daylightCollapseSeverity: 'MEDIUM',
        restructuringRecommended: true,
      },
    ];
    const proposals = collectOvernightRestructuringProposals({
      overnightRestructuringPressures: pressures,
      legTemporalSafetyAssessments: [],
      opportunityMigrationEvaluations: [],
    });
    expect(proposals[0]?.proposedAction).toBe('RELOCATE_OVERNIGHT');
    expect(proposals[0]?.restructuringPressureApproved).toBeDefined();
  });

  it('marks migrationEconomicsApproved when corridor economics approves MIGRATE', () => {
    const pressures: OvernightRestructuringPressure[] = [
      {
        date: '2026-02-11',
        unsafeLegIds: [],
        downstreamShiftMinutes: 60,
        crossDaySpillMinutes: 10,
        operationalWindowViolations: 1,
        daylightCollapseSeverity: 'HIGH',
        restructuringRecommended: true,
      },
    ];
    const proposals = collectOvernightRestructuringProposals({
      overnightRestructuringPressures: pressures,
      legTemporalSafetyAssessments: [],
      opportunityMigrationEvaluations: [
        {
          date: '2026-02-11',
          sourceRegion: 'capital_corridor',
          targetRegion: 'south_coast',
          expectedOpportunityGain: 0.4,
          travelCostMinutes: 150,
          lodgingDisruptionCost: 0.2,
          downstreamPlanImpactScore: 0.1,
          recommendation: 'MIGRATE',
          confidence: 0.8,
          tradeoffScore: 0.1,
          appliedThreshold: 0.45,
          rationale: [],
        },
      ],
    });
    expect(proposals[0]?.migrationEconomicsApproved).toBe(true);
  });
});

describe('evaluateMinimalRepairs + overnight proposals', () => {
  it('attaches overnightRestructuringProposals to result', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [{ day: 1, date: '2026-02-12', timeSlots: [] }],
      temporal: { timeDrifts: [], constraintEdges: [], emittedAt: new Date().toISOString() },
    };
    const legs: LegTemporalSafetyAssessment[] = [
      {
        date: '2026-02-12',
        legId: 'arrival:x',
        estimatedArrivalTime: '17:00',
        severity: 'UNSAFE',
        safeArrival: false,
      },
    ];
    const pressures: OvernightRestructuringPressure[] = [
      {
        date: '2026-02-12',
        unsafeLegIds: ['arrival:x'],
        downstreamShiftMinutes: 45,
        crossDaySpillMinutes: 5,
        operationalWindowViolations: 0,
        daylightCollapseSeverity: 'HIGH',
        restructuringRecommended: true,
      },
    ];

    const r = evaluateMinimalRepairs({
      plan,
      timeDrifts: [],
      overnightRestructuringPressures: pressures,
      legTemporalSafetyAssessments: legs,
    });

    expect(r.overnightRestructuringProposals?.length).toBeGreaterThan(0);
  });
});
