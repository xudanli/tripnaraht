import { materializeProposedCorridorMigrations } from './materialize-corridor-migration-proposal';
import { simulateCorridorMigration, enrichProposalsWithSimulation } from './simulate-corridor-migration';
import type { OpportunityMigrationEvaluation } from '../opportunity/opportunity-migration.types';
import type { TripPlan } from '../plan-model';
import { evaluateMigrationApplyReadiness } from './migration-apply-gates';

describe('materializeProposedCorridorMigrations', () => {
  it('merges corridor keys and only includes MIGRATE', () => {
    const evs: OpportunityMigrationEvaluation[] = [
      {
        date: '2026-04-01',
        sourceRegion: 'capital_corridor',
        targetRegion: 'south_coast',
        expectedOpportunityGain: 0.31,
        travelCostMinutes: 150,
        lodgingDisruptionCost: 0.25,
        downstreamPlanImpactScore: 0.12,
        recommendation: 'MIGRATE',
        confidence: 0.8,
        tradeoffScore: 0.12,
        appliedThreshold: 0.45,
        rationale: ['a'],
      },
      {
        date: '2026-04-03',
        sourceRegion: 'capital_corridor',
        targetRegion: 'south_coast',
        expectedOpportunityGain: 0.28,
        travelCostMinutes: 150,
        lodgingDisruptionCost: 0.3,
        downstreamPlanImpactScore: 0.15,
        recommendation: 'STAY',
        confidence: 0.8,
        tradeoffScore: -0.05,
        appliedThreshold: 0.45,
        rationale: ['b'],
      },
    ];
    const props = materializeProposedCorridorMigrations(evs);
    expect(props).toHaveLength(1);
    expect(props[0]!.affectedDates).toContain('2026-04-01');
    expect(props[0]!.affectedDates).not.toContain('2026-04-03');
    expect(props[0]!.expectedOpportunityGain).toBe(0.31);
  });
});

describe('simulateCorridorMigration', () => {
  it('flags locked hotel as booking conflict', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-04-01',
          timeSlots: [
            {
              id: 'h1',
              time: '20:00',
              title: 'Hotel',
              type: 'hotel',
              locked: true,
            },
          ],
        },
      ],
      temporal: { timeDrifts: [], constraintEdges: [], emittedAt: new Date().toISOString() },
    };
    const proposal = {
      proposalId: 't',
      sourceRegion: 'capital_corridor',
      targetRegion: 'south_coast',
      affectedDates: ['2026-04-01'],
      rationale: [],
      economicApproval: { tradeoffScore: 0.2, threshold: 0.45 },
      expectedOpportunityGain: 0.4,
    };
    const sim = simulateCorridorMigration(proposal, plan);
    expect(sim.bookingConflicts.some(c => c.severity === 'BLOCKING')).toBe(true);
    expect(sim.estimatedOpportunityGain).toBe(0.4);
    expect(sim.temporalStressDelta.ripplePressure01).toBeDefined();
  });

  it('enrichProposalsWithSimulation attaches preview', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [],
    };
    const p = enrichProposalsWithSimulation(
      [
        {
          proposalId: 'x',
          sourceRegion: 'a',
          targetRegion: 'b',
          affectedDates: [],
          rationale: [],
          economicApproval: { tradeoffScore: 0, threshold: 0.6 },
        },
      ],
      plan,
    );
    expect(p[0]!.simulationPreview).toBeDefined();
  });
});

describe('evaluateMigrationApplyReadiness', () => {
  it('blocks when simulation missing', () => {
    const r = evaluateMigrationApplyReadiness({
      proposalId: 'p',
      sourceRegion: 'a',
      targetRegion: 'b',
      affectedDates: [],
      rationale: [],
      economicApproval: { tradeoffScore: 1, threshold: 0 },
    });
    expect(r.allowed).toBe(false);
  });
});
