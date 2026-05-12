import {
  computeOpportunityTradeoff,
  normalizeTradeoffScore01,
} from './compute-opportunity-tradeoff';
import { migrationNormalizedThreshold } from './opportunity-threshold.policy';
import { evaluateOpportunityMigrationsForPlan } from './opportunity-migration-evaluator';
import type { TripPlan } from '../plan-model';
import type { AuroraOpportunitySignal } from '../signals/aurora-opportunity-signals.types';
import { migrationStanceFromObservationIntent } from './opportunity-threshold.policy';

describe('computeOpportunityTradeoff', () => {
  it('uses weighted formula; high disruption pushes STAY at casual threshold', () => {
    const threshold = migrationNormalizedThreshold('casual');
    const r = computeOpportunityTradeoff(
      {
        opportunityGain: 0.35,
        driveDeltaMinutes: 200,
        lodgingDisruptionCost: 0.8,
        downstreamPlanImpactScore: 0.85,
      },
      threshold,
    );
    expect(r.recommendation).toBe('STAY');
    expect(r.rationale.length).toBeGreaterThanOrEqual(1);
  });

  it('allows MIGRATE at hardcore threshold when gain dominates', () => {
    const threshold = migrationNormalizedThreshold('hardcore');
    const r = computeOpportunityTradeoff(
      {
        opportunityGain: 0.55,
        driveDeltaMinutes: 45,
        lodgingDisruptionCost: 0.22,
        downstreamPlanImpactScore: 0.12,
      },
      threshold,
    );
    expect(normalizeTradeoffScore01(r.tradeoffScore)).toBeGreaterThan(threshold);
    expect(r.recommendation).toBe('MIGRATE');
  });
});

describe('evaluateOpportunityMigrationsForPlan', () => {
  it('includes date and appliedThreshold on evaluations', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [{ day: 1, date: '2026-03-01', timeSlots: [] }],
      temporal: { timeDrifts: [], constraintEdges: [], emittedAt: new Date().toISOString() },
    };
    const opp: Partial<Record<string, AuroraOpportunitySignal>> = {
      '2026-03-01': {
        date: '2026-03-01',
        opportunityScore: 0.3,
        confidence: 0.85,
        mobilityRecommendation: 'MOVE_SOUTH',
        observationTier: 'MEDIUM',
      },
    };
    const list = evaluateOpportunityMigrationsForPlan(plan, opp, { stance: 'balanced' });
    expect(list.length).toBe(1);
    expect(list[0]!.date).toBe('2026-03-01');
    expect(list[0]!.appliedThreshold).toBe(migrationNormalizedThreshold('balanced'));
  });
});

describe('migrationStanceFromObservationIntent', () => {
  it('maps CHASE + HIGH on AURORA to hardcore', () => {
    expect(
      migrationStanceFromObservationIntent({
        target: 'AURORA',
        priority: 'HIGH',
        flexibility: 'CHASE',
      }),
    ).toBe('hardcore');
  });
});
