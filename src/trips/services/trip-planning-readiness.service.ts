import { Injectable } from '@nestjs/common';
import type { LightweightTripIntent, PlanningReadiness } from '../types/nl-draft-trip.types';
import { ClarificationFieldPolicyService } from './clarification-field-policy.service';

@Injectable()
export class TripPlanningReadinessService {
  constructor(private readonly clarificationPolicy: ClarificationFieldPolicyService) {}

  evaluateForDraft(intent: LightweightTripIntent): {
    planningReadiness: PlanningReadiness;
    missingForStrategy: string[];
    nextQuestion?: string;
    nextQuestionPolicy?: Record<string, unknown>;
  } {
    const missingForStrategy: string[] = [];
    if (!intent.destinationCountryCode && !intent.destinationText) missingForStrategy.push('destination');
    if (!intent.durationDays && intent.datePrecision === 'NONE') missingForStrategy.push('duration_or_date');
    const nextPolicy = this.clarificationPolicy.pickNextQuestion(intent, [
      'STRATEGY_GENERATION',
      'ITINERARY_GENERATION',
    ]);

    const planningReadiness: PlanningReadiness =
      missingForStrategy.length === 0
        ? 'READY_FOR_STRATEGY'
        : intent.destinationCountryCode || intent.destinationText || intent.durationDays
          ? 'PARTIAL'
          : 'INSUFFICIENT';

    return {
      planningReadiness,
      missingForStrategy,
      nextQuestion: nextPolicy?.question,
      nextQuestionPolicy: nextPolicy,
    };
  }
}
