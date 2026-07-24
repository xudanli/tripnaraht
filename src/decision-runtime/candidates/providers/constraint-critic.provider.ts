/**
 * Rule-based constraint / plan critic — structured signals only (no LLM).
 */

import { Injectable } from '@nestjs/common';
import type {
  CriticProvider,
  CriticProviderResult,
  CriticSignal,
} from '../contracts/decision-providers';

@Injectable()
export class ConstraintCriticProvider implements CriticProvider {
  readonly providerId = 'constraint-critic' as const;

  async critique(input: {
    tripId: string;
    plan?: import('../../../trips/decision/plan-model').TripPlan;
    worldState?: import('../../../trips/decision/world-model').TripWorldState;
  }): Promise<CriticProviderResult> {
    const signals: CriticSignal[] = [];

    if (!input.plan?.days?.length) {
      signals.push({
        code: 'PLAN_EMPTY',
        severity: 'warning',
        message: 'Plan has no days to critique',
      });
    }

    const weatherDates = Object.keys(input.worldState?.signals?.weatherByDate ?? {});
    if (weatherDates.length > 0) {
      signals.push({
        code: 'WEATHER_SIGNALS_PRESENT',
        severity: 'info',
        message: `${weatherDates.length} day(s) with weather signals`,
      });
    }

    return {
      schemaId: 'tripnara.critic_provider_result@v1',
      providerId: this.providerId,
      tripId: input.tripId,
      signals,
      generatedAt: new Date().toISOString(),
    };
  }
}
