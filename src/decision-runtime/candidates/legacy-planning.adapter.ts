/**
 * Legacy TripDecisionEngine / MultiPlanGenerator → DecisionCandidate[] adapter.
 * Does NOT form authoritative decisions — candidates only.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { ConstraintDSL } from '../../trips/decision/constraints/constraint-dsl.types';
import type { TripWorldState } from '../../trips/decision/world-model';
import { MultiPlanGenerator } from '../../trips/decision/services/multi-plan-generator.service';
import type { PlanningCandidateGenerator } from './planning-candidate-generator.interface';
import type { DecisionCandidate, PlanningContext } from './contracts/decision-candidate';
import { mapPlanVariantToDecisionCandidate } from './map-plan-variant.util';

@Injectable()
export class LegacyTripPlanningAdapter implements PlanningCandidateGenerator {
  private readonly logger = new Logger(LegacyTripPlanningAdapter.name);

  constructor(@Optional() private readonly multiPlanGenerator?: MultiPlanGenerator) {}

  async generateCandidates(
    worldState: TripWorldState,
    context: PlanningContext,
  ): Promise<DecisionCandidate[]> {
    if (!this.multiPlanGenerator) {
      throw new Error('MultiPlanGenerator unavailable — cannot produce legacy planning candidates');
    }

    const constraintDsl =
      context.constraintDsl ??
      (worldState.policies as { constraintDSL?: ConstraintDSL } | undefined)?.constraintDSL ??
      this.buildMinimalConstraintDsl(worldState);

    const prefilterFeasibility = context.retainAllCandidates !== true;

    const variants = await this.multiPlanGenerator.generateMultiplePlans(
      worldState,
      constraintDsl,
      { prefilterFeasibility },
    );

    this.logger.debug(
      `[LegacyPlanningAdapter] trip=${context.tripId} variants=${variants.length} prefilter=${prefilterFeasibility}`,
    );

    return variants.map(mapPlanVariantToDecisionCandidate);
  }

  private buildMinimalConstraintDsl(state: TripWorldState): ConstraintDSL {
    const hard: ConstraintDSL['hard_constraints'] = {};
    if (state.context.budget) {
      hard.budget = {
        max: state.context.budget.amount,
        currency: state.context.budget.currency,
        flexible: false,
      };
    }
    if (state.context.startDate && state.context.durationDays) {
      const start = new Date(state.context.startDate);
      const end = new Date(start);
      end.setDate(end.getDate() + state.context.durationDays - 1);
      hard.date_window = {
        start: state.context.startDate,
        end: end.toISOString().slice(0, 10),
        flexible: false,
      };
    }
    return { hard_constraints: hard };
  }
}
