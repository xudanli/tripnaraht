import type { ObjectiveVector } from './objective-vector.types';

export type ParetoPlanKind = 'MERGED' | 'LLM_ONLY' | 'ALGO_ONLY';

export interface ParetoPlanCandidate {
  id: ParetoPlanKind;
  planPayload: { days: Array<{ day: number; slots: Record<string, unknown> }> };
  objectives: ObjectiveVector;
}
