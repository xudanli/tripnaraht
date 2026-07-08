/**
 * Schedule / transport timing conflicts → Gateway ConstraintAssertion (Phase 2b).
 */

import { Injectable } from '@nestjs/common';
import type { ConflictDto } from '../../../trips/dto/trip-conflicts.dto';
import { isScheduleDomainConflict } from '../../../trips/trip-constraint-solver/utils/schedule-domain.util';
import type { ConstraintAssertion } from '../contracts/constraint-assertion';
import { conflictsToGatewayAssertions } from '../adapters/conflict-to-assertion.adapter';

@Injectable()
export class ScheduleConstraintProvider {
  evaluateConflicts(tripId: string, conflicts: ConflictDto[]): ConstraintAssertion[] {
    const scheduleConflicts = conflicts.filter((c) => isScheduleDomainConflict(c));
    return conflictsToGatewayAssertions(scheduleConflicts, tripId);
  }
}
