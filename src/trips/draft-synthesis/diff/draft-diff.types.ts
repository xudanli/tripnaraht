import type { TripDraftSelection } from '../state/trip-draft-state.types';

export type DraftConflictType = 'distance' | 'meal' | 'time' | 'zone';

export interface DraftDiffConflict {
  type: DraftConflictType;
  day: number;
  slot: string;
  llmValue: unknown;
  algoValue: unknown;
}

export interface DraftDiffScores {
  /** 地理/簇连续性启发分 0..1，占位时可均为 0 */
  continuity: number;
  /** 可达/营业可行性启发分 0..1 */
  feasibility: number;
  /** 与用户意图一致度启发分 0..1 */
  coherence: number;
}

export interface DraftDiff {
  added: TripDraftSelection[];
  removed: TripDraftSelection[];
  changed: Array<{ before: TripDraftSelection; after: TripDraftSelection }>;
  conflicts: DraftDiffConflict[];
  score: DraftDiffScores;
}
