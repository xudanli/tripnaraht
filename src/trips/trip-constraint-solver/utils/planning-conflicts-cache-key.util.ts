import { getConstraintsVersion } from './constraints-metadata.util';
import { resolveTripRevision, revisionToString } from './trip-revision.util';

/** planning-conflicts 内存缓存键 — 须随 constraintsVersion 失效 */
export function buildPlanningConflictsCacheKey(trip: {
  updatedAt: Date;
  metadata?: unknown;
}): string {
  const revision = revisionToString(resolveTripRevision(trip));
  const constraintsVersion = getConstraintsVersion(trip.metadata);
  return `${revision}:cv${constraintsVersion}`;
}
