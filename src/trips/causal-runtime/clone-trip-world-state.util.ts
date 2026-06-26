import type { TripWorldState } from '../decision/world-model';

export function cloneTripWorldState(state: TripWorldState): TripWorldState {
  if (typeof structuredClone === 'function') {
    return structuredClone(state);
  }
  return JSON.parse(JSON.stringify(state)) as TripWorldState;
}
