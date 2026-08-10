/**
 * Bridge fuel assessment → shared runbook executor (keeps WP2 API stable).
 */

import { assessIcelandFuel } from '../fuel/assess-iceland-fuel';
import { loadIcelandFuelPolicy } from '../fuel/iceland-fuel.loader';
import type {
  FuelAssessment,
  IcelandFuelAssessmentInput,
} from '../fuel/iceland-fuel.types';
import { executeIcelandDriveRunbook } from './iceland-drive-runbook.executor';
import type { IcelandDriveRunbookExecutionResult } from './iceland-drive-runbook.types';

export function executeIcelandFuelInsufficientRunbook(input: {
  assessment: FuelAssessment;
  userSafeStopped?: boolean;
}): IcelandDriveRunbookExecutionResult {
  return executeIcelandDriveRunbook('IS_RB_FUEL_INSUFFICIENT', {
    eventType: 'FUEL_INSUFFICIENT',
    userSafeStopped: input.userSafeStopped,
    fuelAssessmentStatus: input.assessment.status,
    fuelPrimaryStation: input.assessment.nextPrimaryStation,
    fuelFallbackStation: input.assessment.fallbackStation,
    fuelRecommendedAction: input.assessment.recommendedAction,
    proposedOperations:
      input.assessment.recommendedAction === 'REPLAN_ROUTE'
        ? ['REROUTE', 'END_DAY_EARLY']
        : ['ADD_STOP', 'REROUTE'],
    notes: input.assessment.reasons,
  });
}

export function assessAndExecuteFuelRunbook(
  assessmentInput: IcelandFuelAssessmentInput,
  opts?: { force?: boolean; userSafeStopped?: boolean },
): {
  assessment: FuelAssessment;
  runbook?: IcelandDriveRunbookExecutionResult;
} {
  const assessment = assessIcelandFuel(assessmentInput, loadIcelandFuelPolicy());
  if (assessment.status !== 'BLOCK' && !opts?.force) {
    return { assessment };
  }
  return {
    assessment,
    runbook: executeIcelandFuelInsufficientRunbook({
      assessment,
      userSafeStopped: opts?.userSafeStopped,
    }),
  };
}
