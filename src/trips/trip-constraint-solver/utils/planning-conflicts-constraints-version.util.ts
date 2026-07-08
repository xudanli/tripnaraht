import { getConstraintsVersion } from './constraints-metadata.util';
import type { PlanningConflictsResponse } from '../types/planning-conflicts.types';

export function applyConstraintsVersionToPlanningConflictsResponse(
  response: PlanningConflictsResponse,
  metadata: unknown,
  queryConstraintsVersion?: number,
): PlanningConflictsResponse {
  const constraintsVersion = getConstraintsVersion(metadata);
  const out: PlanningConflictsResponse = {
    ...response,
    constraintsVersion,
  };

  if (
    queryConstraintsVersion != null &&
    queryConstraintsVersion !== constraintsVersion
  ) {
    out.isStale = true;
  }

  return out;
}
