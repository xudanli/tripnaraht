/**
 * ConflictDto → Gateway ConstraintAssertion (Phase 2b schedule domain).
 */

import type { ConflictDto } from '../../../trips/dto/trip-conflicts.dto';
import { mapConflictToFeasibilityIssue } from '../../../trips/trip-constraint-solver/utils/feasibility-assembler.util';
import type { ConstraintAssertion } from '../contracts/constraint-assertion';
import { feasibilityIssueToGatewayAssertion } from './feasibility-issue-to-assertion.adapter';

export const SCHEDULE_CONFLICTS_ENGINE = 'trip-schedule-conflicts';
export const SCHEDULE_CONFLICTS_VERSION = '1.0.0';

export function conflictToGatewayAssertion(
  conflict: ConflictDto,
  tripId: string,
): ConstraintAssertion {
  const issue = mapConflictToFeasibilityIssue(conflict, { tripId });
  return feasibilityIssueToGatewayAssertion(issue, tripId, SCHEDULE_CONFLICTS_ENGINE);
}

export function conflictsToGatewayAssertions(
  conflicts: ConflictDto[],
  tripId: string,
): ConstraintAssertion[] {
  return conflicts.map((c) => conflictToGatewayAssertion(c, tripId));
}
