/**
 * Pure builder for unified constraint assessment (no Nest) — used by smoke + service.
 */

import type { FeasibilityIssueDto } from '../../../trips/trip-constraint-solver/types/trip-constraint-solver.types';
import type { PlanningRuleResult } from '../../../trips/tep/contracts/tep-self-drive.types';
import { feasibilityIssuesToAssessments } from '../adapters/feasibility-issue-to-assessment.adapter';
import { tepRuleResultsToAssessments } from '../adapters/tep-rule-result-to-assessment.adapter';
import type { ConstraintAssessment } from '../contracts/constraint-assessment.types';
import type {
  UnifiedConstraintAssessmentBundle,
  UnifiedConstraintAssessmentEvidence,
  UnifiedConstraintAssessmentLane,
  UnifiedConstraintAssessmentView,
} from '../contracts/unified-constraint-assessment.types';
import { UNIFIED_CONSTRAINT_ASSESSMENT_BUNDLE_SCHEMA } from '../contracts/unified-constraint-assessment.types';
import { resolveAggregateStatus } from './aggregate-status-resolver.util';
import type { EvaluationContextVersion } from '../contracts/evaluation-context-version.types';
import {
  phase0AssessmentConstraintKeys,
  resolveConstraintKeyForFeasibilityIssue,
  resolveConstraintKeyForSdrRule,
} from '../../../trips/trip-constraint-solver/utils/constraint-validator-registry.util';

export type UnifiedConstraintAssessmentMeta = {
  legacyConstraintId?: string;
  contractRequirement?: string;
};

export function buildUnifiedConstraintAssessmentBundle(input: {
  tripId: string;
  generatedAt: string;
  contextVersion: EvaluationContextVersion;
  evaluatedAt: string;
  planVersionRef?: string;
  feasibilityIssues?: FeasibilityIssueDto[];
  tepRuleResults?: PlanningRuleResult[];
  planningAssessments?: ConstraintAssessment[];
  tepAssessments?: ConstraintAssessment[];
  constraintMeta?: Record<string, UnifiedConstraintAssessmentMeta>;
}): UnifiedConstraintAssessmentBundle {
  const planningAssessments =
    input.planningAssessments ??
    feasibilityIssuesToAssessments(input.feasibilityIssues ?? [], {
      tripId: input.tripId,
      evaluationMode: 'PLAN_VERIFY',
      contextVersion: input.contextVersion,
      evaluatedAt: input.evaluatedAt,
    });

  const tepAssessments =
    input.tepAssessments ??
    tepRuleResultsToAssessments(input.tepRuleResults ?? [], {
      tripId: input.tripId,
      evaluationMode: 'PLAN_VERIFY',
      contextVersion: input.contextVersion,
      evaluatedAt: input.evaluatedAt,
    });

  const planningByKey = groupAssessmentsByConstraintKey(planningAssessments, 'planning');
  const executabilityByKey = groupAssessmentsByConstraintKey(tepAssessments, 'executability');

  const keys = [
    ...new Set([
      ...phase0AssessmentConstraintKeys(),
      ...planningByKey.keys(),
      ...executabilityByKey.keys(),
      ...Object.keys(input.constraintMeta ?? {}),
    ]),
  ];

  const items: UnifiedConstraintAssessmentView[] = keys.map((constraintKey) => {
    const meta = input.constraintMeta?.[constraintKey];
    const planning = planningByKey.get(constraintKey)?.[0] ?? null;
    const executability = executabilityByKey.get(constraintKey)?.[0] ?? null;
    const planningLane = planning ? toPlanningLane(planning) : null;
    const executabilityLane = executability ? toExecutabilityLane(executability) : null;

    const problemIds = [
      ...(planningLane?.problemIds ?? []),
      ...(executabilityLane?.problemIds ?? []),
    ].filter((id, index, arr) => arr.indexOf(id) === index);

    return {
      constraintKey,
      legacyConstraintId: meta?.legacyConstraintId,
      contractRequirement: meta?.contractRequirement,
      contextVersion: input.contextVersion,
      evaluatedAt: input.evaluatedAt,
      lanes: {
        planning: planningLane,
        executability: executabilityLane,
        runtime: null,
      },
      aggregateStatus: resolveAggregateStatus({
        planning: planningLane,
        executability: executabilityLane,
        runtime: null,
      }),
      problemIds: problemIds.length ? problemIds : undefined,
    };
  });

  return {
    schemaId: UNIFIED_CONSTRAINT_ASSESSMENT_BUNDLE_SCHEMA,
    tripId: input.tripId,
    generatedAt: input.generatedAt,
    contextVersion: input.contextVersion,
    items,
    meta: {
      itemCount: items.length,
      planVersionRef: input.planVersionRef,
    },
  };
}

function groupAssessmentsByConstraintKey(
  assessments: ConstraintAssessment[],
  lane: 'planning' | 'executability',
): Map<string, ConstraintAssessment[]> {
  const map = new Map<string, ConstraintAssessment[]>();
  for (const assessment of assessments) {
    let key: string | undefined;
    if (lane === 'executability') {
      key =
        resolveConstraintKeyForSdrRule(assessment.ruleRefs?.[0] ?? '') ??
        (phase0AssessmentConstraintKeys().includes(assessment.semanticKey)
          ? assessment.semanticKey
          : undefined);
    } else {
      key = resolveConstraintKeyForFeasibilityIssue({
        semanticKey: assessment.semanticKey,
        issueKind: inferFeasibilityIssueKind(assessment),
      });
    }
    if (!key) continue;
    const bucket = map.get(key) ?? [];
    bucket.push(assessment);
    map.set(key, bucket);
  }
  return map;
}

function inferFeasibilityIssueKind(assessment: ConstraintAssessment): string | undefined {
  if (assessment.explanationCode === 'daily_drive') return 'daily_drive';
  if (assessment.explanationCode === 'no_night_drive') return 'no_night_drive';
  if (assessment.semanticKey === 'EXCESSIVE_DAILY_LOAD') return 'daily_drive';
  if (assessment.explanationCode === 'product_session_time_window') {
    return 'product_session_time_window';
  }
  if (assessment.explanationCode === 'meeting_point_buffer') return 'meeting_point_buffer';
  if (assessment.explanationCode === 'product_participant_eligibility') {
    return 'product_participant_eligibility';
  }
  if (assessment.explanationCode === 'product_weather_dependency') {
    return 'product_weather_dependency';
  }
  if (assessment.semanticKey === 'PRODUCT_SESSION_LOCK_VIOLATION') {
    return 'product_session_time_window';
  }
  if (assessment.semanticKey === 'MEETING_POINT_BUFFER_INSUFFICIENT') {
    return 'meeting_point_buffer';
  }
  if (assessment.semanticKey === 'PRODUCT_ELIGIBILITY_FAILED') {
    return 'product_participant_eligibility';
  }
  if (assessment.semanticKey === 'PRODUCT_WEATHER_HOLD_REQUIRED') {
    return 'product_weather_dependency';
  }
  return undefined;
}

function toPlanningLane(assessment: ConstraintAssessment): UnifiedConstraintAssessmentLane {
  return {
    status: assessment.status,
    source: 'FEASIBILITY',
    ruleId: assessment.ruleRefs?.[0],
    message: assessment.message,
    assessmentId: assessment.assessmentId,
    evidence: measuredValueToEvidence(assessment),
    problemIds: assessment.problemIds,
  };
}

function toExecutabilityLane(assessment: ConstraintAssessment): UnifiedConstraintAssessmentLane {
  return {
    status: assessment.status,
    source: 'TEP',
    ruleId: assessment.ruleRefs?.[0],
    message: assessment.message,
    assessmentId: assessment.assessmentId,
    evidence: measuredValueToEvidence(assessment),
    problemIds: assessment.problemIds,
  };
}

function measuredValueToEvidence(
  assessment: ConstraintAssessment,
): UnifiedConstraintAssessmentEvidence | undefined {
  const measured = assessment.measuredValue as
    | {
        dayIndex?: number;
        equivalentMinutes?: number;
        finishLocal?: string;
        cutoffLocal?: string;
        sunsetLocal?: string;
        civilDuskLocal?: string;
        maxMinutesAfterSunset?: number;
        legId?: string;
        segmentLabel?: string;
        degradationReason?: string;
      }
    | undefined;
  if (!measured && !assessment.message) return undefined;
  const minutes = measured?.equivalentMinutes;
  const dayIndex = measured?.dayIndex;
  const arriveLocal = measured?.finishLocal;
  const sunsetLocal = measured?.sunsetLocal;
  const cutoffLocal = measured?.cutoffLocal;
  const buffer = measured?.maxMinutesAfterSunset;

  return {
    dayIndex,
    day: dayIndex,
    measuredMinutes: minutes,
    actual:
      arriveLocal ??
      (minutes != null ? formatMinutes(minutes) : undefined),
    arriveLocal,
    sunsetLocal,
    cutoffLocal,
    civilDuskLocal: measured?.civilDuskLocal,
    maxMinutesAfterSunset: buffer,
    segmentLabel: measured?.segmentLabel,
    degradationReason: measured?.degradationReason,
    ruleId: assessment.ruleRefs?.[0],
    message: assessment.message,
    affectedRefs: assessment.subjectRefs,
    limit:
      sunsetLocal && buffer != null
        ? `日落 ${sunsetLocal} + ${buffer}min`
        : undefined,
  };
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h${mins}m`;
}

export function formatContractRequirement(constraintKey: string, value: unknown): string | undefined {
  switch (constraintKey) {
    case 'MAX_DAILY_DRIVE': {
      if (typeof value === 'number') return `≤ ${value}h`;
      if (value && typeof value === 'object' && 'hours' in (value as object)) {
        return `≤ ${(value as { hours: number }).hours}h`;
      }
      return '≤ 6h';
    }
    case 'NO_NIGHT_DRIVE':
      return '不夜驾';
    case 'OFFICIAL_IS_FROAD_2WD':
      return 'F-road 须四驱';
    case 'NO_UNPAVED_ROAD':
      return '租车合同禁 F-road / 碎石限制';
    case 'FIXED_APPOINTMENTS':
      return '固定预约可达';
    case 'PRODUCT_SESSION_TIME_WINDOW':
      return '班次硬时间窗';
    case 'MEETING_POINT_BUFFER':
      return '集合点交通缓冲';
    case 'PRODUCT_PARTICIPANT_ELIGIBILITY':
      return '产品参与资格';
    case 'PRODUCT_WEATHER_DEPENDENCY':
      return '天气依赖须有 Plan B';
    default:
      return undefined;
  }
}
