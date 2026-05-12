/**
 * Opportunity Migration Evaluator（P2-A）— 仅静态经济学；不接 fatigue。
 */

import type { ISODate } from '../world-model';
import type { TripPlan } from '../plan-model';
import type {
  AuroraMobilityRecommendation,
  AuroraOpportunitySignal,
} from '../signals/aurora-opportunity-signals.types';
import { computeOpportunityTradeoff } from './compute-opportunity-tradeoff';
import type { OpportunityMigrationEvaluation } from './opportunity-migration.types';
import type { AuroraMigrationStance } from './opportunity-threshold.policy';
import { migrationNormalizedThreshold } from './opportunity-threshold.policy';

const REGION_CAPITAL = 'capital_corridor';
const REGION_SOUTH = 'south_coast';
const REGION_INLAND = 'highland_inland';

const DEFAULT_CAPITAL_TO_SOUTH_DRIVE_MIN = 150;
const DEFAULT_TO_INLAND_DRIVE_MIN = 90;

function heuristicGainFromMobility(
  source: AuroraOpportunitySignal,
  mobility: AuroraMobilityRecommendation,
): number {
  const base = source.opportunityScore;
  if (mobility === 'MOVE_SOUTH') {
    return Math.min(
      0.48,
      (1 - base) * 0.55 + (source.observationTier === 'LOW' ? 0.18 : 0.08),
    );
  }
  if (mobility === 'MOVE_INLAND') {
    return Math.min(0.35, (1 - base) * 0.4);
  }
  return 0;
}

function targetRegionForMobility(m: AuroraMobilityRecommendation): string {
  if (m === 'MOVE_SOUTH') {
    return REGION_SOUTH;
  }
  if (m === 'MOVE_INLAND') {
    return REGION_INLAND;
  }
  return REGION_CAPITAL;
}

function lodgingDisruptionFromPlan(plan: TripPlan, date: ISODate): number {
  const day = plan.days.find(d => d.date === date);
  if (!day) {
    return 0.35;
  }
  const hotels = day.timeSlots.filter(s => s.type === 'hotel');
  if (hotels.length === 0) {
    return 0.25;
  }
  const anyLocked = hotels.some(h => h.locked);
  return anyLocked ? 0.72 : 0.28;
}

function temporalRippleFromPlan(plan: TripPlan): number {
  const drifts = plan.temporal?.timeDrifts ?? [];
  const seqSum = drifts
    .filter(d => d.propagationPolicy === 'PROPAGATE_SEQUENCE')
    .reduce((s, d) => s + Math.max(0, d.deltaMinutes), 0);
  return Math.min(1, seqSum / 200);
}

export interface EvaluateOpportunityMigrationInput {
  date: ISODate;
  opportunity: AuroraOpportunitySignal;
  plan: TripPlan;
  /** intent 敏感阈值：casual / hardcore 等 */
  stance: AuroraMigrationStance;
  travelCostMinutesOverride?: number;
}

export function evaluateOpportunityMigration(
  input: EvaluateOpportunityMigrationInput,
): OpportunityMigrationEvaluation | null {
  const mob = input.opportunity.mobilityRecommendation;
  if (mob !== 'MOVE_SOUTH' && mob !== 'MOVE_INLAND') {
    return null;
  }

  const expectedOpportunityGain = heuristicGainFromMobility(input.opportunity, mob);
  const travelCostMinutes =
    input.travelCostMinutesOverride ??
    (mob === 'MOVE_SOUTH' ? DEFAULT_CAPITAL_TO_SOUTH_DRIVE_MIN : DEFAULT_TO_INLAND_DRIVE_MIN);

  const lodgingDisruptionCost = lodgingDisruptionFromPlan(input.plan, input.date);
  const downstreamPlanImpactScore = temporalRippleFromPlan(input.plan);

  const threshold = migrationNormalizedThreshold(input.stance);
  const trade = computeOpportunityTradeoff(
    {
      opportunityGain: expectedOpportunityGain,
      driveDeltaMinutes: travelCostMinutes,
      lodgingDisruptionCost,
      downstreamPlanImpactScore,
    },
    threshold,
  );

  const confidence = Math.min(input.opportunity.confidence, trade.confidence);

  return {
    date: input.date,
    sourceRegion: REGION_CAPITAL,
    targetRegion: targetRegionForMobility(mob),
    expectedOpportunityGain,
    travelCostMinutes,
    lodgingDisruptionCost,
    downstreamPlanImpactScore,
    recommendation: trade.recommendation,
    confidence,
    tradeoffScore: trade.tradeoffScore,
    appliedThreshold: threshold,
    rationale: trade.rationale,
  };
}

export interface EvaluateOpportunityMigrationsOptions {
  stance: AuroraMigrationStance;
}

export function evaluateOpportunityMigrationsForPlan(
  plan: TripPlan,
  auroraOpportunityByDate: Partial<Record<ISODate, AuroraOpportunitySignal>>,
  options: EvaluateOpportunityMigrationsOptions,
): OpportunityMigrationEvaluation[] {
  const out: OpportunityMigrationEvaluation[] = [];
  for (const day of plan.days) {
    const o = auroraOpportunityByDate[day.date];
    if (!o) {
      continue;
    }
    const ev = evaluateOpportunityMigration({
      date: day.date,
      opportunity: o,
      plan,
      stance: options.stance,
    });
    if (ev) {
      out.push(ev);
    }
  }
  return out.sort((a, b) => b.tradeoffScore - a.tradeoffScore);
}
