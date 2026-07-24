import {
  INSPIRATION_CANDIDATE_TYPE,
  POI_MATCH_STATUS,
} from '../constants/guide-to-plan-status.constants';

export const POI_MATCHABLE_CANDIDATE_TYPES = [
  INSPIRATION_CANDIDATE_TYPE.POI,
  INSPIRATION_CANDIDATE_TYPE.RESTAURANT,
  INSPIRATION_CANDIDATE_TYPE.HOTEL,
  INSPIRATION_CANDIDATE_TYPE.ACTIVITY,
] as const;

const POI_MATCHABLE_TYPES = new Set<string>(POI_MATCHABLE_CANDIDATE_TYPES);

export function isPoiMatchableCandidate(candidateType: string): boolean {
  return POI_MATCHABLE_TYPES.has(candidateType);
}

export function countUnmatchedPoiCandidates(
  candidates: Array<{ candidateType: string; matchStatus: string }>,
): number {
  return candidates.filter(
    (c) =>
      isPoiMatchableCandidate(c.candidateType) &&
      c.matchStatus === POI_MATCH_STATUS.UNMATCHED,
  ).length;
}
