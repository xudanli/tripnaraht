/**
 * TEP PlanningRuleResult → ConstraintAssessment (executability lane).
 */

import type { PlanningRuleResult } from '../../../trips/tep/contracts/tep-self-drive.types';
import type { DailyDrivePlan } from '../../../trips/tep/contracts/tep-self-drive.types';
import {
  parseSdr202RuleMetadata,
  resolveSdr202SegmentLabel,
} from '../../../trips/tep/utils/sdr-202-rule-metadata.util';
import { resolveConstraintKeyForSdrRule } from '../../../trips/trip-constraint-solver/utils/constraint-validator-registry.util';
import type { ConstraintEvaluationStatus } from '../contracts/constraint-assertion';
import type {
  ConstraintAssessment,
  ConstraintEvaluationMode,
} from '../contracts/constraint-assessment.types';
import { CONSTRAINT_ASSESSMENT_SCHEMA } from '../contracts/constraint-assessment.types';
import type { EvaluationContextVersion } from '../contracts/evaluation-context-version.types';
import {
  tepOutcomeToExecutabilityLaneStatus,
} from '../utils/aggregate-status-resolver.util';

function parseDayIndexFromRefs(refs: string[] | null | undefined): number | undefined {
  for (const ref of Array.isArray(refs) ? refs : []) {
    const match = /^day_(\d+)$/.exec(ref);
    if (match) return Number(match[1]);
  }
  return undefined;
}

function parseMinutesFromExplanation(explanation: string | undefined): number | undefined {
  if (!explanation) return undefined;
  const match = /(\d+)min/.exec(explanation);
  return match ? Number(match[1]) : undefined;
}

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function findDailyDrivePlan(
  rule: PlanningRuleResult,
  dailyDrivePlans?: DailyDrivePlan[],
): DailyDrivePlan | undefined {
  const dayRef = asArray(rule.affectedRefs).find((ref) => /^day_(\d+)$/.test(ref));
  const dayIndex = dayRef ? Number(dayRef.replace('day_', '')) : undefined;
  if (dayIndex == null) return undefined;
  return asArray(dailyDrivePlans).find((row) => row.dayIndex === dayIndex);
}

function buildSdr202MeasuredValue(
  result: PlanningRuleResult,
  context?: {
    dailyDrivePlans?: DailyDrivePlan[];
    itemLabelsById?: Map<string, string>;
  },
): Record<string, unknown> | undefined {
  if (result.ruleId !== 'SDR-202') return undefined;
  const meta = parseSdr202RuleMetadata(result);
  if (result.degraded) {
    return {
      dayIndex: meta.dayIndex,
      degradationReason: meta.degradationReason ?? result.degradationReason,
    };
  }
  const plan = findDailyDrivePlan(result, context?.dailyDrivePlans);
  const segmentLabel = resolveSdr202SegmentLabel({
    rule: result,
    plan,
    itemLabelsById: context?.itemLabelsById,
  });
  return {
    dayIndex: meta.dayIndex,
    equivalentMinutes: meta.overMinutes,
    finishLocal: meta.finishLocal,
    cutoffLocal: meta.cutoffLocal,
    sunsetLocal: meta.sunsetLocal,
    civilDuskLocal: meta.civilDuskLocal,
    maxMinutesAfterSunset: meta.maxMinutesAfterSunset,
    legId: meta.legId,
    segmentLabel,
  };
}

export function tepRuleResultToAssessment(
  result: PlanningRuleResult,
  input: {
    tripId: string;
    evaluationMode: ConstraintEvaluationMode;
    contextVersion: EvaluationContextVersion;
    evaluatedAt: string;
    index: number;
    dailyDrivePlans?: DailyDrivePlan[];
    itemLabelsById?: Map<string, string>;
  },
): ConstraintAssessment | null {
  const constraintKey = resolveConstraintKeyForSdrRule(result.ruleId);
  if (!constraintKey) return null;

  const dayIndex = parseDayIndexFromRefs(asArray(result.affectedRefs));
  const measuredMinutes = parseMinutesFromExplanation(result.explanation);
  const status: ConstraintEvaluationStatus = tepOutcomeToExecutabilityLaneStatus(result.outcome);
  const sdr202Measured = buildSdr202MeasuredValue(result, {
    dailyDrivePlans: input.dailyDrivePlans,
    itemLabelsById: input.itemLabelsById,
  });

  return {
    schemaId: CONSTRAINT_ASSESSMENT_SCHEMA,
    assessmentId: `assess_tep_${result.ruleId}_${input.index}`,
    evaluationMode: input.evaluationMode,
    status,
    semanticKey: constraintKey,
    subjectRefs: result.affectedRefs,
    affectedScope: {
      tripId: input.tripId,
      dayIds: dayIndex != null ? [`day-${dayIndex}`] : undefined,
      routeSegmentIds: asArray(result.affectedRefs).filter((r) => r.startsWith('segment:')),
      activityIds: asArray(result.affectedRefs).filter(
        (r) => r.startsWith('item_') || r.startsWith('activity_'),
      ),
    },
    ruleRefs: [result.ruleId],
    explanationCode: `tep.${result.ruleId}.${result.outcome}`,
    measuredValue:
      sdr202Measured ??
      (measuredMinutes != null
        ? { dayIndex, equivalentMinutes: measuredMinutes }
        : dayIndex != null
          ? { dayIndex }
          : undefined),
    evidenceRefs: asArray(result.evidenceRefs).map((e) => e.predicate ?? e.provider),
    message: result.explanation,
    contextVersion: input.contextVersion,
    evaluatedAt: input.evaluatedAt,
    sourceRef: {
      system: 'TEP',
      refId: `${result.ruleId}:${asArray(result.affectedRefs).join('|')}`,
    },
  };
}

export function tepRuleResultsToAssessments(
  results: PlanningRuleResult[],
  input: {
    tripId: string;
    evaluationMode: ConstraintEvaluationMode;
    contextVersion: EvaluationContextVersion;
    evaluatedAt: string;
    dailyDrivePlans?: DailyDrivePlan[];
    itemLabelsById?: Map<string, string>;
  },
): ConstraintAssessment[] {
  return results
    .map((result, index) =>
      tepRuleResultToAssessment(result, {
        ...input,
        index,
      }),
    )
    .filter((row): row is ConstraintAssessment => row !== null);
}
