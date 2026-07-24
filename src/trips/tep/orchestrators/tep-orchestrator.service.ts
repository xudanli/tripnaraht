import { Injectable } from '@nestjs/common';
import type {
  DailyDrivePlan,
  ExecutabilityAssessment,
  SelfDriveProfile,
} from '../contracts/tep-self-drive.types';
import type { TepValidationInput } from '../validation/tep-validation.types';
import {
  buildExecutabilityAssessmentFromRuleResults,
  mergePlanningRuleResults,
  validateTepPlanningSnapshot,
} from '../validation/tep-validator';
import { runTepValidation } from '../validation/sdr-rule-evaluators';

export interface TepOrchestratorInput extends TepValidationInput {
  feasibilityRuleResults?: import('../contracts/tep-self-drive.types').PlanningRuleResult[];
}

@Injectable()
export class TepOrchestratorService {
  /** 规划期 TEP Validator — Profile + DailyDrivePlan → ExecutabilityAssessment */
  validatePlanningSnapshot(input: TepOrchestratorInput): ExecutabilityAssessment {
    const tepResults = runTepValidation(input);
    const merged = mergePlanningRuleResults(
      tepResults,
      input.feasibilityRuleResults ?? [],
    );

    return buildExecutabilityAssessmentFromRuleResults({
      tripId: input.tripId,
      ruleResults: merged,
      packId: input.packId ?? `destination.${input.countryCode.toLowerCase()}`,
      packVersion: input.packVersion ?? '1.0.0',
      planVersionRef: input.planVersionRef,
      evaluatedAt: input.evaluatedAt,
    });
  }

  /** 仅 TEP 规则层（不含 feasibility 投影） */
  validateTepOnly(input: TepValidationInput): ExecutabilityAssessment {
    return validateTepPlanningSnapshot(input);
  }

  buildValidationInput(input: {
    tripId: string;
    countryCode: string;
    profile: SelfDriveProfile;
    dailyDrivePlans: DailyDrivePlan[];
    planVersionRef?: string;
    roadConditions?: TepValidationInput['roadConditions'];
    activityArrivals?: TepValidationInput['activityArrivals'];
  }): TepValidationInput {
    return {
      tripId: input.tripId,
      countryCode: input.countryCode,
      profile: input.profile,
      dailyDrivePlans: input.dailyDrivePlans,
      planVersionRef: input.planVersionRef,
      roadConditions: input.roadConditions,
      activityArrivals: input.activityArrivals,
    };
  }
}
