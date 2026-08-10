/**
 * 带 Outcome Interpretation 的 Temporal Evaluation 包装。
 * 轨迹失效 / 观测缺口时清除不当 False Alert / Miss 标记。
 */

import {
  evaluateTemporalProjection,
  type ObservedTemporalOutcomeV1,
  type TemporalEvaluationV1,
} from '../temporal-graduation/temporal-evaluation.util';
import type { TemporalImpactV1 } from '../temporal-graduation/temporal-impact.util';
import {
  interpretTemporalOutcome,
  type OutcomeInterpretationHintsV1,
  type OutcomeInterpretationV1,
} from './outcome-interpretation.util';

export function evaluateShadowTemporalProjection(input: {
  impact: TemporalImpactV1;
  interpretationHints: OutcomeInterpretationHintsV1;
  onsetToleranceHours?: number;
  deadlineToleranceHours?: number;
}): {
  interpretation: OutcomeInterpretationV1;
  evaluation: TemporalEvaluationV1;
} {
  const interpretation = interpretTemporalOutcome({
    predictedDirection: input.impact.direction,
    hints: input.interpretationHints,
  });

  const observed: ObservedTemporalOutcomeV1 = {
    deteriorated:
      interpretation.interpretedDeteriorated ??
      input.interpretationHints.rawDeteriorated,
    onsetHours: input.interpretationHints.onsetHours,
    deadlineHours: input.interpretationHints.deadlineHours,
    observedDirection: input.interpretationHints.observedDirection,
  };

  let evaluation = evaluateTemporalProjection({
    impact: input.impact,
    observed,
    onsetToleranceHours: input.onsetToleranceHours,
    deadlineToleranceHours: input.deadlineToleranceHours,
  });

  if (interpretation.inconclusive) {
    evaluation = {
      ...evaluation,
      falseAlert: false,
      missedDeterioration: false,
      directionHit: true,
      score: Math.min(evaluation.score, 0.55),
      notesZh: [
        ...evaluation.notesZh,
        `interpreted:inconclusive;${interpretation.reasonZh}`,
        'falseAlert_cleared_by_outcome_interpretation',
      ],
    };
  } else {
    if (!interpretation.mayCountAsFalseAlert && evaluation.falseAlert) {
      evaluation = {
        ...evaluation,
        falseAlert: false,
        notesZh: [
          ...evaluation.notesZh,
          'falseAlert_suppressed:trajectory_or_gap',
        ],
      };
    }
    if (
      !interpretation.mayCountAsMissedDeterioration &&
      evaluation.missedDeterioration
    ) {
      evaluation = {
        ...evaluation,
        missedDeterioration: false,
        notesZh: [
          ...evaluation.notesZh,
          'miss_suppressed:trajectory_or_gap',
        ],
      };
    }
  }

  return { interpretation, evaluation };
}
