/**
 * ONT-P2-02B — build fixed 5-section display + emit InternalTemporalAdvisory
 */

import { createHash } from 'crypto';
import type { PredictionRecord } from '../contracts';
import { isOntologyP2InternalAdvisoryKillSwitchEngaged } from './advisory.kill-switch';
import type { InternalTemporalAdvisory, AdvisoryExpectedOutcome } from './advisory.types';
import { INTERNAL_TEMPORAL_ADVISORY_SCHEMA_ID } from './advisory.types';
import type { InternalTemporalAdvisoryAuthorizationV2 } from './authorization';
import {
  APPROVED_INTERNAL_REVIEWERS,
  INTERNAL_TEMPORAL_ADVISORY_TRIP_IDS,
  isInternalAdvisoryApproved,
} from './authorization';
import type { InternalAdvisoryStore } from './advisory.store';

export interface EmitAdvisoryContext {
  contextRevision: number;
  factSetVersion: string;
  routeSegmentId?: string;
  vehicleClass?: string;
  plannedPassAt?: string;
  viewerId: string;
  /** P1 canonical outcome if present — advisory must not weaken it */
  p1CanonicalOutcome?: 'ALLOW' | 'WARNING' | 'NEED_CONFIRM' | 'BLOCK' | string;
  nowMs?: number;
}

function mapExpectedOutcome(
  peak: string,
  p1?: string,
): AdvisoryExpectedOutcome {
  if (p1 === 'BLOCK') return 'BLOCK';
  if (peak === 'RED') return 'NEED_CONFIRM';
  if (peak === 'ORANGE') return 'WARNING';
  if (peak === 'YELLOW') return 'WARNING';
  return 'UNKNOWN';
}

function buildDisplay(input: {
  prediction: PredictionRecord;
  vehicleClass?: string;
  routeSegmentId?: string;
  plannedPassAt?: string;
  deadline?: string;
  onset?: string;
  deterioration?: string;
  insufficientEvidence: boolean;
}): InternalTemporalAdvisory['display'] {
  const peak = input.prediction.temporalImpact.predictedPeakLevel;
  const onset = input.onset ?? input.prediction.temporalImpact.predictedOnset;
  const det = input.deterioration;
  const whatPredicted = det
    ? `预计 ${onset} 后风险开始上升，并于 ${det} 明显恶化（peak=${peak}）。`
    : `预计 ${onset} 后，该路段侧风风险明显上升（peak=${peak}）。`;

  const vehicle = input.vehicleClass ?? '车辆类型未确认';
  const seg = input.routeSegmentId ?? '相关路段';
  const pass = input.plannedPassAt
    ? `当前行程预计 ${input.plannedPassAt} 经过 ${seg}`
    : `当前行程涉及 ${seg}`;
  const whyRelevant = input.insufficientEvidence
    ? `${pass}；车辆信息不足，证据不足，不做猜测性推荐。`
    : `${pass}，车辆为 ${vehicle}。`;

  const latestActionBy = input.deadline
    ? `建议最晚在 ${input.deadline} 前决定是否提前出发或调整路线。`
    : '暂无明确最晚行动时间。';

  const currentRecommendation = input.insufficientEvidence
    ? '证据不足：请先确认车辆类型与路段暴露后再评估；不自动修改行程。'
    : '推荐提前约 2 小时出发；备选为更换低暴露路线。';

  const authorityStatus = [
    'SHADOW 预测建议',
    '尚未进入正式约束裁决',
    '不会自动修改行程',
    'P1 Canonical Assessment 优先于本建议',
  ].join(' · ');

  return {
    whatPredicted,
    whyRelevant,
    latestActionBy,
    currentRecommendation,
    authorityStatus,
  };
}

export function canViewerSeeInternalAdvisory(
  viewerId: string,
  auth: InternalTemporalAdvisoryAuthorizationV2,
): boolean {
  return auth.scope.approvedInternalReviewers.includes(viewerId);
}

export function emitInternalTemporalAdvisory(input: {
  authorization: InternalTemporalAdvisoryAuthorizationV2;
  prediction: PredictionRecord;
  store: InternalAdvisoryStore;
  ctx: EmitAdvisoryContext;
}):
  | { advisory: InternalTemporalAdvisory; withdrawn: InternalTemporalAdvisory[] }
  | { skipped: string } {
  const auth = input.authorization;
  if (!isInternalAdvisoryApproved(auth.status)) {
    return { skipped: `authorization status=${auth.status}` };
  }
  if (isOntologyP2InternalAdvisoryKillSwitchEngaged()) {
    return { skipped: 'INTERNAL_ADVISORY_KILL_SWITCH' };
  }
  if (auth.scope.authorityMode !== 'SHADOW') {
    return { skipped: 'authorityMode must be SHADOW' };
  }
  if (auth.scope.destination !== 'IS') {
    return { skipped: 'destination must be IS' };
  }
  if (auth.scope.semanticScope !== 'WEATHER_DETERIORATION') {
    return { skipped: 'semanticScope must be WEATHER_DETERIORATION' };
  }

  const tripId = input.prediction.tripId ?? '';
  if (
    !INTERNAL_TEMPORAL_ADVISORY_TRIP_IDS.includes(
      tripId as (typeof INTERNAL_TEMPORAL_ADVISORY_TRIP_IDS)[number],
    )
  ) {
    return { skipped: `trip ${tripId} not in selectedInternalTrips` };
  }
  if (!canViewerSeeInternalAdvisory(input.ctx.viewerId, auth)) {
    return { skipped: `viewer ${input.ctx.viewerId} not approvedInternalReviewer` };
  }
  if (input.prediction.authorityMode !== 'SHADOW') {
    return { skipped: 'prediction must be SHADOW' };
  }

  const nowMs = input.ctx.nowMs ?? Date.now();
  const onset = input.prediction.temporalImpact.predictedOnset;
  const deterioration = input.prediction.temporalImpact.predictedDeterioration;
  const deadline =
    input.prediction.interventionDeadline.interventionDeadline;
  const deadlineMs = Date.parse(deadline);
  const expired = Number.isFinite(deadlineMs) && deadlineMs < nowMs;

  if (expired) {
    return { skipped: 'DEADLINE_EXPIRED_NOT_ACTIONABLE' };
  }

  const insufficientEvidence = !input.ctx.vehicleClass;
  let expectedOutcome = mapExpectedOutcome(
    input.prediction.temporalImpact.predictedPeakLevel,
    input.ctx.p1CanonicalOutcome,
  );

  const display = buildDisplay({
    prediction: input.prediction,
    vehicleClass: input.ctx.vehicleClass,
    routeSegmentId: input.ctx.routeSegmentId,
    plannedPassAt: input.ctx.plannedPassAt,
    deadline,
    onset,
    deterioration,
    insufficientEvidence,
  });

  let p1CanonicalConflict: InternalTemporalAdvisory['p1CanonicalConflict'];
  if (input.ctx.p1CanonicalOutcome === 'BLOCK') {
    expectedOutcome = 'BLOCK';
    p1CanonicalConflict = {
      p1Outcome: 'BLOCK',
      note: 'P1 Canonical Assessment=BLOCK；SHADOW 建议不得弱化正式裁决，仅作旁路参考并进入审计',
    };
  } else if (
    input.ctx.p1CanonicalOutcome &&
    input.ctx.p1CanonicalOutcome !== 'ALLOW' &&
    input.prediction.temporalImpact.predictedPeakLevel === 'NONE'
  ) {
    p1CanonicalConflict = {
      p1Outcome: String(input.ctx.p1CanonicalOutcome),
      note: 'Prediction 与 P1 结果冲突：显示冲突并审计，不覆盖 Canonical',
    };
  }

  const advisoryId = `adv_${createHash('sha256')
    .update(
      [
        tripId,
        input.prediction.predictionId,
        input.prediction.predictionVersion,
        String(input.ctx.contextRevision),
        deadline,
      ].join('|'),
    )
    .digest('hex')
    .slice(0, 16)}`;

  const advisory: InternalTemporalAdvisory = {
    schemaId: INTERNAL_TEMPORAL_ADVISORY_SCHEMA_ID,
    advisoryId,
    predictionId: input.prediction.predictionId,
    predictionVersion: input.prediction.predictionVersion,
    temporalImpactId: input.prediction.temporalImpact.temporalImpactId,
    tripId,
    routeSegmentId: input.ctx.routeSegmentId,
    contextRevision: input.ctx.contextRevision,
    factSetVersion: input.ctx.factSetVersion,
    predictedOnset: onset,
    predictedDeterioration: deterioration,
    interventionDeadline: deadline,
    expectedOutcome,
    confidence: input.prediction.temporalImpact.confidence,
    evidenceRefs: [
      ...input.prediction.evidenceRefs,
      ...(insufficientEvidence ? ['INSUFFICIENT_EVIDENCE:vehicleClass'] : []),
    ],
    recommendedDraft: {
      primary: insufficientEvidence
        ? '收集车辆证据后再评估'
        : '提前约 2 小时出发',
      alternatives: insufficientEvidence
        ? []
        : ['更换低暴露路线', '改住上一站'],
    },
    display,
    authorityMode: 'SHADOW',
    labels: {
      predictionOnly: true,
      notCanonicalAssessment: true,
      willNotModifyPlan: true,
    },
    status: 'ACTIVE',
    p1CanonicalConflict,
    emittedAt: new Date(nowMs).toISOString(),
    expiresAt: deadline,
  };

  const published = input.store.publish(advisory);
  return {
    advisory: published.current,
    withdrawn: published.withdrawn,
  };
}

/** Visible projection for approved reviewers only */
export function projectInternalAdvisoryForViewer(input: {
  advisory: InternalTemporalAdvisory;
  authorization: InternalTemporalAdvisoryAuthorizationV2;
  viewerId: string;
  currentContextRevision: number;
  activePredictionId?: string;
  activePredictionVersion?: string;
}):
  | { view: InternalTemporalAdvisory; sections: InternalTemporalAdvisory['display'] }
  | { skipped: string } {
  if (!canViewerSeeInternalAdvisory(input.viewerId, input.authorization)) {
    return { skipped: 'viewer_not_approved' };
  }
  if (isOntologyP2InternalAdvisoryKillSwitchEngaged()) {
    return { skipped: 'INTERNAL_ADVISORY_KILL_SWITCH' };
  }
  if (input.advisory.status !== 'ACTIVE') {
    return { skipped: `advisory_status_${input.advisory.status}` };
  }
  if (input.advisory.contextRevision !== input.currentContextRevision) {
    return { skipped: 'advisory_context_revision_mismatch' };
  }
  if (
    input.activePredictionId &&
    input.advisory.predictionId !== input.activePredictionId
  ) {
    return { skipped: 'advisory_from_superseded_prediction' };
  }
  if (
    input.activePredictionVersion &&
    input.advisory.predictionVersion !== input.activePredictionVersion
  ) {
    return { skipped: 'advisory_from_superseded_prediction' };
  }
  return { view: input.advisory, sections: input.advisory.display };
}

export { APPROVED_INTERNAL_REVIEWERS };
