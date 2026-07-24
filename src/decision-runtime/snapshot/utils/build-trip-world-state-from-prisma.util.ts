/**
 * Minimal TripWorldState materialization for snapshot / gateway reads.
 */

import { DateTime } from 'luxon';
import type { ISODate, TripWorldState } from '../../../trips/decision/world-model';
import { applyPrismaTripIdToWorldState } from '../../../trips/execution-closure-persistence/apply-prisma-trip-id-to-world-state';

export interface PrismaTripForWorldState {
  id: string;
  destination: string;
  startDate: Date;
  endDate: Date;
  metadata?: unknown;
  budgetConfig?: unknown;
  pacingConfig?: unknown;
}

export function buildTripWorldStateFromPrismaTrip(trip: PrismaTripForWorldState): TripWorldState {
  const startDate = DateTime.fromJSDate(trip.startDate).toISODate() as ISODate;
  const durationDays = Math.max(
    1,
    Math.floor(
      DateTime.fromJSDate(trip.endDate).diff(DateTime.fromJSDate(trip.startDate), 'days').days,
    ) + 1,
  );

  const pacing = (trip.pacingConfig ?? {}) as Record<string, unknown>;
  const budget = (trip.budgetConfig ?? {}) as Record<string, unknown>;

  const state = {
    context: {
      tripId: trip.id,
      destination: trip.destination,
      startDate,
      durationDays,
      budget: budget.total
        ? {
            amount: Number(budget.total),
            currency: String(budget.currency ?? 'CNY'),
            style: budget.style as 'low' | 'medium' | 'high' | undefined,
          }
        : undefined,
      preferences: {
        intents: {},
        pace: (pacing.level as 'relaxed' | 'moderate' | 'intense') ?? 'moderate',
        riskTolerance: 'medium' as const,
      },
    },
    candidatesByDate: {},
    signals: {
      lastUpdatedAt: new Date().toISOString(),
    },
  } as TripWorldState;

  applyPrismaTripIdToWorldState(state, trip.id);
  return state;
}
