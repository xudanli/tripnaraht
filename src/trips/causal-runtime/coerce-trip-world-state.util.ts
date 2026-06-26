import type { TripWorldState } from '../decision/world-model';

/** DTO / session JSON → TripWorldState (requires context). */
export function asTripWorldState(
  value: Record<string, unknown> | undefined,
): TripWorldState | undefined {
  if (!value?.['context']) return undefined;
  return value as unknown as TripWorldState;
}

/** TripWorldState → API DTO record shape. */
export function asWorldStateRecord(
  state: TripWorldState | undefined,
): Record<string, unknown> | undefined {
  if (!state) return undefined;
  return state as unknown as Record<string, unknown>;
}
