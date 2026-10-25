/**
 * TripRun 用户反馈 / 行为 / Outcome Loop → metadata.observability_v1 合并。
 *
 * M1 Outcome Loop：Decision Presented → accept|edit|reject|regenerate|abandon|delete_day|bypass_ai
 * 旅行强信号优先于星级评分。
 */

import {
  TRIP_RUN_OBSERVABILITY_SCHEMA_ID,
  computeDecisionCompleteness,
  type TripRunObservabilityV1,
} from './trip-run-observability.util';

export type TripRunOutcomeEventType =
  | 'accept'
  | 'edit'
  | 'reject'
  | 'regenerate'
  | 'abandon'
  | 'delete_day'
  | 'bypass_ai';

export type TripRunTrustSignal =
  | 'HIGH_TRUST'
  | 'PARTIAL_CORRECT'
  | 'LOW_SATISFACTION'
  | 'SEVERE_FAILURE'
  | 'TRUST_DECLINE';

export type TripRunFeedbackInput = {
  rating?: number | null;
  accepted?: boolean | null;
  modified?: boolean | null;
  userCorrection?: string | null;
  /** 自由文本备注 */
  comment?: string | null;
  source?: string | null;
};

export type TripRunBehaviorInput = {
  clickedRecommend?: boolean | null;
  regenerated?: boolean | null;
  editedRoute?: boolean | null;
  abandoned?: boolean | null;
  /** 扩展行为键（保留兼容） */
  extra?: Record<string, boolean | null>;
  source?: string | null;
};

export type TripRunOutcomeEventInput = {
  event: TripRunOutcomeEventType;
  detail?: string | null;
  dayIndex?: number | null;
  source?: string | null;
};

export type TripRunFeedbackMergeResult = {
  metadata: Record<string, any>;
  feedback: NonNullable<TripRunObservabilityV1['feedback']>;
  behavior: NonNullable<TripRunObservabilityV1['behavior']>;
  outcome: NonNullable<TripRunObservabilityV1['outcome']>;
};

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function clampRating(rating: unknown): number | null {
  if (typeof rating !== 'number' || !Number.isFinite(rating)) return null;
  return Math.max(1, Math.min(5, Math.round(rating)));
}

function mergeBool(
  prev: boolean | null | undefined,
  next: boolean | null | undefined,
): boolean | null {
  if (typeof next === 'boolean') return next;
  if (typeof prev === 'boolean') return prev;
  return null;
}

export function trustSignalFromOutcomeEvent(event: TripRunOutcomeEventType): TripRunTrustSignal {
  switch (event) {
    case 'accept':
      return 'HIGH_TRUST';
    case 'edit':
      return 'PARTIAL_CORRECT';
    case 'regenerate':
    case 'reject':
      return 'LOW_SATISFACTION';
    case 'delete_day':
      return 'SEVERE_FAILURE';
    case 'abandon':
    case 'bypass_ai':
      return 'TRUST_DECLINE';
    default:
      return 'LOW_SATISFACTION';
  }
}

/** outcome 事件 → feedback / behavior 强信号投影 */
export function deriveFlagsFromOutcomeEvent(event: TripRunOutcomeEventType): {
  feedback: TripRunFeedbackInput;
  behavior: TripRunBehaviorInput;
} {
  switch (event) {
    case 'accept':
      return {
        feedback: { accepted: true, modified: false },
        behavior: { clickedRecommend: true, abandoned: false, regenerated: false },
      };
    case 'edit':
      return {
        feedback: { accepted: false, modified: true },
        behavior: { editedRoute: true, abandoned: false },
      };
    case 'reject':
      return {
        feedback: { accepted: false, modified: false },
        behavior: { abandoned: false },
      };
    case 'regenerate':
      return {
        feedback: { accepted: false },
        behavior: { regenerated: true },
      };
    case 'abandon':
      return {
        feedback: { accepted: false },
        behavior: { abandoned: true },
      };
    case 'delete_day':
      return {
        feedback: { accepted: false, modified: true },
        behavior: { editedRoute: true, abandoned: false },
      };
    case 'bypass_ai':
      return {
        feedback: { accepted: false },
        behavior: { abandoned: true },
      };
    default:
      return { feedback: {}, behavior: {} };
  }
}

/** 从 RLHF feedback_type 推导 accepted/modified */
export function deriveFeedbackFlagsFromRlhfType(
  feedbackType: string,
  value?: { rating?: number; comment?: string; modification?: unknown },
): TripRunFeedbackInput {
  const t = String(feedbackType || '').toUpperCase();
  if (t === 'ACCEPT') {
    return { accepted: true, modified: false, rating: value?.rating ?? null };
  }
  if (t === 'REJECT') {
    return {
      accepted: false,
      modified: false,
      userCorrection: value?.comment ?? null,
      rating: value?.rating ?? null,
    };
  }
  if (t === 'MODIFY') {
    return {
      accepted: false,
      modified: true,
      userCorrection: value?.comment ?? null,
      rating: value?.rating ?? null,
    };
  }
  if (t === 'RATING') {
    return { rating: value?.rating ?? null, userCorrection: value?.comment ?? null };
  }
  return {
    rating: value?.rating ?? null,
    userCorrection: value?.comment ?? null,
  };
}

/** 从 RLHF behavior 推导 behavior 块 */
export function deriveBehaviorFromRlhfSignal(signal: {
  signal_type: string;
  target?: { element_type?: string; element_id?: string };
}): TripRunBehaviorInput {
  const type = String(signal.signal_type || '').toUpperCase();
  const element = String(signal.target?.element_type || '').toUpperCase();
  if (type === 'CLICK' && (element === 'PLAN' || element === 'OPTION')) {
    return { clickedRecommend: true };
  }
  if (type === 'VIEW' && element === 'PLAN') {
    return { clickedRecommend: true };
  }
  return {};
}

/**
 * 将 feedback / behavior / outcome 合并进 TripRun.metadata（含 observability_v1）。
 */
export function mergeTripRunFeedbackIntoMetadata(
  existingMetadata: unknown,
  input: {
    feedback?: TripRunFeedbackInput | null;
    behavior?: TripRunBehaviorInput | null;
    outcomeEvent?: TripRunOutcomeEventInput | null;
    recordedAt?: string;
  },
): TripRunFeedbackMergeResult {
  const meta = { ...asRecord(existingMetadata) };
  const now = input.recordedAt ?? new Date().toISOString();

  const prevObs = asRecord(meta.observability_v1);
  const prevFeedback = {
    ...asRecord(prevObs.feedback),
    ...asRecord(meta.feedback_v1),
  };
  const prevBehavior = {
    ...asRecord(prevObs.behavior),
    ...asRecord(meta.behavior_v1),
  };

  const fromOutcome = input.outcomeEvent?.event
    ? deriveFlagsFromOutcomeEvent(input.outcomeEvent.event)
    : { feedback: {}, behavior: {} };

  const fbIn = { ...fromOutcome.feedback, ...(input.feedback ?? {}) };
  const bhIn = { ...fromOutcome.behavior, ...(input.behavior ?? {}) };

  const feedback = {
    rating:
      fbIn.rating !== undefined ? clampRating(fbIn.rating) : clampRating(prevFeedback.rating),
    accepted: mergeBool(prevFeedback.accepted, fbIn.accepted),
    modified: mergeBool(prevFeedback.modified, fbIn.modified),
    userCorrection:
      fbIn.userCorrection !== undefined
        ? fbIn.userCorrection
        : fbIn.comment !== undefined
          ? fbIn.comment
          : typeof prevFeedback.userCorrection === 'string'
            ? prevFeedback.userCorrection
            : null,
  };

  const behavior = {
    clickedRecommend: mergeBool(prevBehavior.clickedRecommend, bhIn.clickedRecommend),
    regenerated: mergeBool(prevBehavior.regenerated, bhIn.regenerated),
    editedRoute: mergeBool(prevBehavior.editedRoute, bhIn.editedRoute),
    abandoned: mergeBool(prevBehavior.abandoned, bhIn.abandoned),
  };

  const prevEvents = Array.isArray(meta.outcome_events) ? [...meta.outcome_events] : [];
  if (input.outcomeEvent?.event) {
    prevEvents.push({
      event: input.outcomeEvent.event,
      detail: input.outcomeEvent.detail ?? null,
      dayIndex: input.outcomeEvent.dayIndex ?? null,
      source: input.outcomeEvent.source ?? fbIn.source ?? bhIn.source ?? 'api',
      at: now,
      trustSignal: trustSignalFromOutcomeEvent(input.outcomeEvent.event),
    });
  }

  const latest = prevEvents.length ? prevEvents[prevEvents.length - 1] : null;
  const outcome: NonNullable<TripRunObservabilityV1['outcome']> = {
    latestEvent: latest ? String(latest.event) : asRecord(prevObs.outcome).latestEvent ?? null,
    trustSignal: latest
      ? trustSignalFromOutcomeEvent(latest.event as TripRunOutcomeEventType)
      : (asRecord(prevObs.outcome).trustSignal as TripRunTrustSignal | null) ?? null,
    verified: prevEvents.length > 0 || !!asRecord(prevObs.outcome).verified,
    eventCount: prevEvents.length || Number(asRecord(prevObs.outcome).eventCount) || 0,
  };

  const qualityPrev = asRecord(prevObs.qualityMetrics);
  const qualityMetrics = {
    taskSuccess: typeof qualityPrev.taskSuccess === 'boolean' ? qualityPrev.taskSuccess : null,
    constraintCoverage:
      typeof qualityPrev.constraintCoverage === 'number' ? qualityPrev.constraintCoverage : null,
    hallucinationRisk:
      typeof qualityPrev.hallucinationRisk === 'number' ? qualityPrev.hallucinationRisk : null,
    evidenceCoverage:
      typeof qualityPrev.evidenceCoverage === 'number' ? qualityPrev.evidenceCoverage : null,
    recoverySuccess:
      typeof qualityPrev.recoverySuccess === 'boolean' ? qualityPrev.recoverySuccess : null,
    userSatisfaction: feedback.rating != null ? feedback.rating / 5 : qualityPrev.userSatisfaction ?? null,
    toolEfficiency:
      typeof qualityPrev.toolEfficiency === 'number' ? qualityPrev.toolEfficiency : null,
  };

  const decisionCompleteness =
    prevObs.decisionCompleteness ??
    computeDecisionCompleteness(prevObs.decisionTrace ?? null, prevObs.evidenceTrace ?? null);

  const observability_v1: TripRunObservabilityV1 = {
    schemaId: TRIP_RUN_OBSERVABILITY_SCHEMA_ID,
    version: 1,
    projectedAt:
      typeof prevObs.projectedAt === 'string' ? prevObs.projectedAt : now,
    decisionCompleteness,
    decisionTrace: prevObs.decisionTrace ?? null,
    evidenceTrace: prevObs.evidenceTrace ?? null,
    steps: Array.isArray(prevObs.steps) ? prevObs.steps : [],
    failure: prevObs.failure ?? null,
    memoryTrace: prevObs.memoryTrace ?? null,
    toolEvaluation: prevObs.toolEvaluation ?? null,
    feedback,
    behavior,
    outcome,
    qualityMetrics,
    benchmark: prevObs.benchmark ?? null,
  };

  const history = Array.isArray(meta.feedback_history) ? [...meta.feedback_history] : [];
  history.push({
    at: now,
    feedback: input.feedback ?? null,
    behavior: input.behavior ?? null,
    outcomeEvent: input.outcomeEvent ?? null,
    source: fbIn.source ?? bhIn.source ?? input.outcomeEvent?.source ?? 'api',
  });

  return {
    metadata: {
      ...meta,
      observability_v1,
      feedback_v1: feedback,
      behavior_v1: behavior,
      outcome_v1: outcome,
      outcome_events: prevEvents.slice(-50),
      feedback_updated_at: now,
      feedback_history: history.slice(-40),
    },
    feedback,
    behavior,
    outcome,
  };
}

/** 读路径：把 feedback_v1 / behavior_v1 / outcome_v1 叠到 observability */
export function overlayFeedbackOntoObservability(
  observability: TripRunObservabilityV1 | null,
  metadata: Record<string, any>,
): TripRunObservabilityV1 | null {
  const fb = asRecord(metadata.feedback_v1);
  const bh = asRecord(metadata.behavior_v1);
  const oc = asRecord(metadata.outcome_v1 ?? observability?.outcome);
  const hasFb =
    fb.rating != null ||
    typeof fb.accepted === 'boolean' ||
    typeof fb.modified === 'boolean' ||
    typeof fb.userCorrection === 'string';
  const hasBh =
    typeof bh.clickedRecommend === 'boolean' ||
    typeof bh.regenerated === 'boolean' ||
    typeof bh.editedRoute === 'boolean' ||
    typeof bh.abandoned === 'boolean';
  const hasOc = typeof oc.latestEvent === 'string' || oc.verified === true;

  if (!hasFb && !hasBh && !hasOc) {
    return observability
      ? {
          ...observability,
          decisionCompleteness:
            observability.decisionCompleteness ??
            computeDecisionCompleteness(observability.decisionTrace, observability.evidenceTrace),
          outcome: observability.outcome ?? null,
        }
      : null;
  }

  const feedback = hasFb
    ? {
        rating: clampRating(fb.rating) ?? observability?.feedback?.rating ?? null,
        accepted:
          typeof fb.accepted === 'boolean' ? fb.accepted : observability?.feedback?.accepted ?? null,
        modified:
          typeof fb.modified === 'boolean' ? fb.modified : observability?.feedback?.modified ?? null,
        userCorrection:
          typeof fb.userCorrection === 'string'
            ? fb.userCorrection
            : observability?.feedback?.userCorrection ?? null,
      }
    : observability?.feedback ?? null;

  const behavior = hasBh
    ? {
        clickedRecommend:
          typeof bh.clickedRecommend === 'boolean'
            ? bh.clickedRecommend
            : observability?.behavior?.clickedRecommend ?? null,
        regenerated:
          typeof bh.regenerated === 'boolean'
            ? bh.regenerated
            : observability?.behavior?.regenerated ?? null,
        editedRoute:
          typeof bh.editedRoute === 'boolean'
            ? bh.editedRoute
            : observability?.behavior?.editedRoute ?? null,
        abandoned:
          typeof bh.abandoned === 'boolean'
            ? bh.abandoned
            : observability?.behavior?.abandoned ?? null,
      }
    : observability?.behavior ?? null;

  const outcome = hasOc
    ? {
        latestEvent: typeof oc.latestEvent === 'string' ? oc.latestEvent : null,
        trustSignal: (oc.trustSignal as TripRunTrustSignal | null) ?? null,
        verified: oc.verified === true,
        eventCount: typeof oc.eventCount === 'number' ? oc.eventCount : 0,
      }
    : observability?.outcome ?? null;

  const base: TripRunObservabilityV1 = observability ?? {
    schemaId: TRIP_RUN_OBSERVABILITY_SCHEMA_ID,
    version: 1,
    projectedAt: new Date().toISOString(),
    decisionCompleteness: null,
    decisionTrace: null,
    evidenceTrace: null,
    steps: [],
    failure: null,
    memoryTrace: null,
    toolEvaluation: null,
    feedback: null,
    behavior: null,
    outcome: null,
    qualityMetrics: null,
    benchmark: null,
  };

  return {
    ...base,
    decisionCompleteness:
      base.decisionCompleteness ??
      computeDecisionCompleteness(base.decisionTrace, base.evidenceTrace),
    feedback,
    behavior,
    outcome,
    qualityMetrics: {
      taskSuccess: base.qualityMetrics?.taskSuccess ?? null,
      constraintCoverage: base.qualityMetrics?.constraintCoverage ?? null,
      hallucinationRisk: base.qualityMetrics?.hallucinationRisk ?? null,
      evidenceCoverage: base.qualityMetrics?.evidenceCoverage ?? null,
      recoverySuccess: base.qualityMetrics?.recoverySuccess ?? null,
      userSatisfaction:
        clampRating(fb.rating) != null
          ? clampRating(fb.rating)! / 5
          : base.qualityMetrics?.userSatisfaction ?? null,
      toolEfficiency: base.qualityMetrics?.toolEfficiency ?? null,
    },
  };
}
