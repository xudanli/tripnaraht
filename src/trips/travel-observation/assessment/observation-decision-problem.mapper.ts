import type { ObservationAssessment } from '../observation.types';
import {
  constraintBridgeForSemanticKey,
  resolvePreviewCorridor,
  shouldOpenDecisionProblem,
} from './observation-action.builder';
import type {
  LookDecisionProblem,
  LookDecisionProblemUpsertInput,
} from './look-decision-problem.types';

export function buildLookDecisionProblemUpsert(input: {
  tripId: string;
  observationId: string;
  assessment: ObservationAssessment;
  existingProblemId?: string;
}): LookDecisionProblemUpsertInput | null {
  const { assessment } = input;
  if (!shouldOpenDecisionProblem(assessment) || !assessment.decisionProblem) {
    return null;
  }

  const semanticKey = assessment.decisionProblem.semanticKey;
  const preview = resolvePreviewCorridor({
    semanticKey,
    assessmentStatus: assessment.status,
    existingProblemId: input.existingProblemId,
  });

  // After create, DECISION corridor pending refs get rewritten to decision:{id}
  return {
    tripId: input.tripId,
    observationId: input.observationId,
    assessmentId: assessment.assessmentId,
    assessmentRevision: assessment.assessmentRevision,
    type: assessment.decisionProblem.type,
    semanticKey,
    title: titleFor(semanticKey, assessment),
    description: [
      assessment.summary.whatHappened,
      assessment.summary.impact,
      assessment.summary.recommendation,
    ].join(' '),
    assessmentStatus: assessment.status,
    verificationStatus: assessment.verificationStatus,
    evidenceIds: [...assessment.evidenceIds],
    urgency: urgencyFor(assessment),
    constraintBridgeKey: constraintBridgeForSemanticKey(semanticKey),
    preview,
  };
}

export function finalizePreviewRef(
  problem: LookDecisionProblem,
): LookDecisionProblem {
  if (
    problem.preview.corridor === 'DECISION' &&
    problem.preview.previewRef.startsWith('decision:pending:')
  ) {
    return {
      ...problem,
      preview: {
        ...problem.preview,
        previewRef: `decision:${problem.problemId}`,
      },
    };
  }
  if (
    problem.preview.corridor === 'REPAIR' ||
    problem.preview.corridor === 'ARRANGE_UWC'
  ) {
    // Keep repair/arrange refs; also expose decision deep-link as secondary via problemId
    return problem;
  }
  if (problem.preview.corridor === 'NAVIGATION') {
    return problem;
  }
  return {
    ...problem,
    preview: {
      ...problem.preview,
      previewRef: `decision:${problem.problemId}`,
      corridor: 'DECISION',
    },
  };
}

function titleFor(
  semanticKey: string,
  assessment: ObservationAssessment,
): string {
  switch (semanticKey) {
    case 'RULE_TRIGGER.FROAD_VEHICLE_MISMATCH':
      return '车辆与 F-road 不适配';
    case 'EXECUTION_DEVIATION.WRONG_MEETING_POINT':
      return '集合点可能不正确';
    case 'DATA_CONFLICT.IMAGE_LOCATION_MISMATCH':
      return '图片与位置冲突';
    case 'DATA_CONFLICT.ROAD_STATUS_CONFLICT':
      return '现场与官方道路状态冲突';
    default:
      return `现场观察需确认（${assessment.status}）`;
  }
}

function urgencyFor(
  assessment: ObservationAssessment,
): LookDecisionProblem['urgency'] {
  if (assessment.status === 'EXECUTION_BLOCK') return 'HIGH';
  if (assessment.verificationStatus === 'CONFLICTING') return 'MEDIUM';
  if (assessment.status === 'SUGGEST_REPLACE') return 'MEDIUM';
  return 'LOW';
}
