import { ASSESSMENT_CTA } from '../cta-and-roles';
import type {
  AssessmentStatus,
  ObservationAction,
  ObservationAssessment,
} from '../observation.types';
import type {
  LookDecisionProblem,
  LookPreviewCorridor,
} from './look-decision-problem.types';

/**
 * Q2 CTA routing priority:
 * 1. Existing DecisionProblem
 * 2. Repair Preview
 * 3. Arrange UWC
 * 4. UNSUPPORTED_ACTION_CORRIDOR
 */
export function resolvePreviewCorridor(input: {
  semanticKey: string;
  assessmentStatus: AssessmentStatus;
  existingProblemId?: string;
}): {
  corridor: LookPreviewCorridor;
  previewRef: string;
  label: string;
} {
  const label =
    input.assessmentStatus === 'EXECUTION_BLOCK'
      ? ASSESSMENT_CTA.EXECUTION_BLOCK.zh.primary
      : input.assessmentStatus === 'SUGGEST_REPLACE'
        ? ASSESSMENT_CTA.SUGGEST_REPLACE.zh.primary
        : ASSESSMENT_CTA.NEED_CONFIRM.zh.primary;

  if (input.existingProblemId) {
    return {
      corridor: 'DECISION',
      previewRef: `decision:${input.existingProblemId}`,
      label,
    };
  }

  switch (input.semanticKey) {
    case 'RULE_TRIGGER.FROAD_VEHICLE_MISMATCH':
      return {
        corridor: 'REPAIR',
        previewRef: 'repair:TERRAIN_F_ROAD_UNFIT',
        label,
      };
    case 'EXECUTION_DEVIATION.WRONG_MEETING_POINT':
      return {
        corridor: 'NAVIGATION',
        previewRef: 'navigation:meeting_point',
        label: ASSESSMENT_CTA.NEED_CONFIRM.zh.primary,
      };
    case 'DATA_CONFLICT.ROAD_STATUS_CONFLICT':
    case 'DATA_CONFLICT.IMAGE_LOCATION_MISMATCH':
      return {
        corridor: 'DECISION',
        previewRef: `decision:pending:${input.semanticKey}`,
        label: ASSESSMENT_CTA.CONFLICTING.zh.primary,
      };
    case 'OBSERVATION.ROAD.CLOSED_SIGN_DETECTED':
      return {
        corridor: 'ARRANGE_UWC',
        previewRef: 'arrange:road_closure_reroute',
        label,
      };
    default:
      if (
        input.assessmentStatus === 'EXECUTION_BLOCK' ||
        input.assessmentStatus === 'SUGGEST_REPLACE'
      ) {
        return {
          corridor: 'UNSUPPORTED',
          previewRef: 'unsupported:UNSUPPORTED_ACTION_CORRIDOR',
          label,
        };
      }
      return {
        corridor: 'DECISION',
        previewRef: `decision:pending:${input.semanticKey}`,
        label,
      };
  }
}

export function constraintBridgeForSemanticKey(
  semanticKey: string,
): string | undefined {
  if (semanticKey === 'RULE_TRIGGER.FROAD_VEHICLE_MISMATCH') {
    return 'OFFICIAL_IS_FROAD_2WD';
  }
  if (semanticKey === 'DATA_CONFLICT.ROAD_STATUS_CONFLICT') {
    return 'ROAD_STATUS';
  }
  return undefined;
}

/** Attach linkedDecisionProblemId + replace PREVIEW/NAVIGATION actions from problem */
export function enrichAssessmentWithDecisionProblem(
  assessment: ObservationAssessment,
  problem: LookDecisionProblem,
): ObservationAssessment {
  const withoutPreviewNav = assessment.actions.filter(
    (a) => a.type !== 'PREVIEW' && a.type !== 'NAVIGATION',
  );

  const primaryAction: ObservationAction =
    problem.preview.corridor === 'NAVIGATION'
      ? {
          type: 'NAVIGATION',
          routeRef: problem.preview.previewRef,
          label: problem.preview.label,
        }
      : {
          type: 'PREVIEW',
          previewRef: problem.preview.previewRef,
          label: problem.preview.label,
        };

  return {
    ...assessment,
    decisionProblem: {
      type: problem.type,
      semanticKey: problem.semanticKey,
      linkedDecisionProblemId: problem.problemId,
    },
    actions: [primaryAction, ...withoutPreviewNav],
    writesPlanVersion: false,
  };
}

export function shouldOpenDecisionProblem(
  assessment: ObservationAssessment,
): boolean {
  if (!assessment.decisionProblem) return false;
  return (
    assessment.status === 'EXECUTION_BLOCK' ||
    assessment.status === 'SUGGEST_REPLACE' ||
    assessment.status === 'NEED_CONFIRM' ||
    assessment.verificationStatus === 'CONFLICTING'
  );
}
