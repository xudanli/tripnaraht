import type { PrismaClient } from '@prisma/client';
import type { TravelEventPersistenceResult } from '../../trips/event-store/types/travel-event.types';

/** Prisma interactive transaction client (shared with outbox staging). */
export type RuntimePrismaTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export type Gate1RuntimeStagedResult = { staged: true; outboxId: string };

export type Gate1RuntimeEmitResult =
  | TravelEventPersistenceResult
  | Gate1RuntimeStagedResult
  | null;

export function isStagedRuntimeEmit(
  result: Gate1RuntimeEmitResult,
): result is Gate1RuntimeStagedResult {
  return result != null && 'staged' in result && result.staged === true;
}

/** Backfill / metrics: staged outbox row or direct persist counts as success. */
export function countsAsRuntimeEmitPersisted(
  result: Gate1RuntimeEmitResult,
): boolean {
  if (result == null) return false;
  if (isStagedRuntimeEmit(result)) return true;
  return result.persisted === true;
}
