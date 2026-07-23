/**
 * ONT-P2-03A — emit / project Selected User Temporal Advisory
 * Eligibility = selected trip AND explicit opt-in (never OR)
 * No one-click adopt; P1 Canonical visually preferred
 */

import { createHash } from 'crypto';
import type { PredictionRecord } from '../contracts';
import type { SelectedUserTemporalAdvisoryAuthorizationApproved } from './authorization';
import {
  isApprovedSelectedTrip,
  isApprovedSelectedUser,
  UserOptInConsentStore,
} from './consent.store';
import { isOntologyP2UserAdvisoryKillSwitchEngaged } from './user-advisory.kill-switch';
import type { UserAdvisoryStore } from './user-advisory.store';
import type {
  UserAdvisoryExpectedOutcome,
  UserTemporalAdvisory,
} from './user-advisory.types';
import { USER_TEMPORAL_ADVISORY_SCHEMA_ID } from './user-advisory.types';

export interface EmitUserAdvisoryContext {
  userId: string;
  contextRevision: number;
  factSetVersion: string;
  routeSegmentId?: string;
  vehicleClass?: string;
  plannedPassAt?: string;
  destination: 'IS' | string;
  semanticScope?: 'WEATHER_DETERIORATION' | string;
  p1CanonicalOutcome?: 'ALLOW' | 'WARNING' | 'NEED_CONFIRM' | 'BLOCK' | string;
  nowMs?: number;
}

function mapExpectedOutcome(peak: string): UserAdvisoryExpectedOutcome {
  if (peak === 'RED') return 'NEED_CONFIRM';
  if (peak === 'ORANGE' || peak === 'YELLOW') return 'WARNING';
  return 'UNKNOWN';
}

function buildUserDisplay(input: {
  onset?: string;
  deterioration?: string;
  peak: string;
  vehicleClass?: string;
  routeSegmentId?: string;
  plannedPassAt?: string;
  deadline?: string;
  p1IsBlock: boolean;
  p1SupplementText?: string;
}): UserTemporalAdvisory['display'] {
  const onsetHint = input.onset
    ? formatLocalish(input.onset)
    : '预计时段';
  const whatPredicted = `预计 ${onsetHint} 后，该路段侧风风险明显上升。`;

  const vehicle = input.vehicleClass ?? '车辆类型未确认';
  const seg = input.routeSegmentId ?? '该路段';
  const whyRelevant = input.plannedPassAt
    ? `当前路线预计 ${formatLocalish(input.plannedPassAt)} 经过 ${seg}，车辆为 ${vehicle}。`
    : `当前路线涉及 ${seg}，车辆为 ${vehicle}。`;

  const latestActionBy = input.deadline
    ? `建议最晚在 ${formatLocalish(input.deadline)} 前决定是否提前出发或调整路线。`
    : '暂无明确最晚行动时间。';

  const recommendation =
    '推荐提前约 2 小时出发；也可以查看低风暴露替代路线。';

  const currentStatus = input.p1IsBlock
    ? [
        '正式风险状态以当前行程提示为准（当前路线不可执行）。',
        input.p1SupplementText ?? '',
        '这是预测建议，不会自动修改行程。',
      ]
        .filter(Boolean)
        .join(' ')
    : '这是预测建议，尚未进入正式约束裁决，不会自动修改行程。';

  return {
    whatPredicted,
    whyRelevant,
    latestActionBy,
    recommendation,
    currentStatus,
  };
}

function formatLocalish(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    // Prefer time-of-day for deadlines; include date hint when onset
    if (iso.includes('T')) {
      const day = iso.slice(0, 10);
      return `${day} ${hh}:${mm}`;
    }
    return `${hh}:${mm}`;
  } catch {
    return iso;
  }
}

export function evaluateUserAdvisoryEligibility(input: {
  authorization: SelectedUserTemporalAdvisoryAuthorizationApproved;
  consent: UserOptInConsentStore;
  tripId: string;
  userId: string;
  destination: string;
  semanticScope: string;
  prediction: PredictionRecord;
  nowMs?: number;
}): { eligible: boolean; reason?: string } {
  if (input.authorization.decision !== 'APPROVE_SELECTED_USER_TEMPORAL_ADVISORY_PILOT') {
    return { eligible: false, reason: 'AUTHORIZATION_NOT_APPROVED' };
  }
  if (input.destination !== 'IS') {
    return { eligible: false, reason: 'NON_ICELAND_TRIP' };
  }
  if (input.semanticScope !== 'WEATHER_DETERIORATION') {
    return { eligible: false, reason: 'OTHER_SEMANTIC' };
  }
  if (!isApprovedSelectedTrip(input.tripId)) {
    return { eligible: false, reason: 'TRIP_NOT_SELECTED' };
  }
  if (!isApprovedSelectedUser(input.userId)) {
    return { eligible: false, reason: 'USER_NOT_SELECTED' };
  }
  // AND: consent must match for this user+trip
  if (!input.consent.hasValidOptIn(input.userId, input.tripId)) {
    return { eligible: false, reason: 'CONSENT_NOT_MATCHED' };
  }
  if (input.prediction.authorityMode !== 'SHADOW') {
    return { eligible: false, reason: 'PREDICTION_NOT_SHADOW' };
  }
  const deadline = input.prediction.interventionDeadline?.interventionDeadline;
  const deadlineMs = deadline ? Date.parse(deadline) : NaN;
  const nowMs = input.nowMs ?? Date.now();
  if (Number.isFinite(deadlineMs) && deadlineMs < nowMs) {
    return { eligible: false, reason: 'DEADLINE_EXPIRED' };
  }
  return { eligible: true };
}

export function emitUserTemporalAdvisory(input: {
  authorization: SelectedUserTemporalAdvisoryAuthorizationApproved;
  consent: UserOptInConsentStore;
  prediction: PredictionRecord;
  store: UserAdvisoryStore;
  ctx: EmitUserAdvisoryContext;
}):
  | { advisory: UserTemporalAdvisory; withdrawn: UserTemporalAdvisory[] }
  | { skipped: string } {
  if (isOntologyP2UserAdvisoryKillSwitchEngaged()) {
    return { skipped: 'USER_ADVISORY_KILL_SWITCH' };
  }

  const tripId = input.prediction.tripId ?? '';
  const gate = evaluateUserAdvisoryEligibility({
    authorization: input.authorization,
    consent: input.consent,
    tripId,
    userId: input.ctx.userId,
    destination: input.ctx.destination,
    semanticScope: input.ctx.semanticScope ?? 'WEATHER_DETERIORATION',
    prediction: input.prediction,
    nowMs: input.ctx.nowMs,
  });
  if (!gate.eligible) {
    return { skipped: gate.reason ?? 'NOT_ELIGIBLE' };
  }

  const nowMs = input.ctx.nowMs ?? Date.now();
  const onset = input.prediction.temporalImpact.predictedOnset;
  const deterioration = input.prediction.temporalImpact.predictedDeterioration;
  const deadline = input.prediction.interventionDeadline.interventionDeadline;
  const peak = input.prediction.temporalImpact.predictedPeakLevel;
  const p1IsBlock = input.ctx.p1CanonicalOutcome === 'BLOCK';

  const p1SupplementText = p1IsBlock
    ? `预测显示该风险预计持续至 ${formatLocalish(deterioration ?? onset ?? deadline)}。`
    : undefined;

  const display = buildUserDisplay({
    onset,
    deterioration,
    peak,
    vehicleClass: input.ctx.vehicleClass,
    routeSegmentId: input.ctx.routeSegmentId,
    plannedPassAt: input.ctx.plannedPassAt,
    deadline,
    p1IsBlock,
    p1SupplementText,
  });

  // Never soften BLOCK into "consider adjusting"
  if (p1IsBlock) {
    display.recommendation =
      '正式阻断已生效；预测仅补充风险持续时间，请遵循当前行程提示。';
  }

  const advisoryId = `uadv_${createHash('sha256')
    .update(
      [
        input.ctx.userId,
        tripId,
        input.prediction.predictionId,
        input.prediction.predictionVersion,
        String(input.ctx.contextRevision),
        deadline,
      ].join('|'),
    )
    .digest('hex')
    .slice(0, 16)}`;

  const advisory: UserTemporalAdvisory = {
    schemaId: USER_TEMPORAL_ADVISORY_SCHEMA_ID,
    advisoryId,
    predictionId: input.prediction.predictionId,
    predictionVersion: input.prediction.predictionVersion,
    temporalImpactId: input.prediction.temporalImpact.temporalImpactId,
    tripId,
    userId: input.ctx.userId,
    routeSegmentId: input.ctx.routeSegmentId,
    contextRevision: input.ctx.contextRevision,
    factSetVersion: input.ctx.factSetVersion,
    predictedOnset: onset,
    predictedDeterioration: deterioration,
    interventionDeadline: deadline,
    expectedOutcome: mapExpectedOutcome(peak),
    confidence: input.prediction.temporalImpact.confidence,
    evidenceRefs: [...input.prediction.evidenceRefs],
    authorityMode: 'SHADOW',
    deliveryMode: 'ADVISORY_ONLY',
    experimentBanner: {
      title: '天气预测建议 · 实验功能',
      willNotAutoModifyPlan: true,
      canonicalRiskTakesPrecedence: true,
    },
    display,
    allowedActions: [
      'VIEW_EVIDENCE',
      'VIEW_PREDICTION_UPDATED_AT',
      'VIEW_AFFECTED_SEGMENT',
      'VIEW_RECOMMENDATION',
      'ENTER_EXISTING_PLANNING_FLOW',
      'FEEDBACK_USEFUL',
      'DISMISS_EXPERIMENT',
    ],
    forbiddenActions: [
      'ADOPT_AND_MUTATE_PLAN',
      'AUTO_REROUTE',
      'IMMEDIATE_CONFIRM',
      'CONTINUE_EXECUTE',
      'IGNORE_CANONICAL_RISK',
    ],
    p1CanonicalSupplement: p1IsBlock
      ? {
          p1Outcome: 'BLOCK',
          supplementOnly: true,
          text: p1SupplementText!,
        }
      : undefined,
    status: 'ACTIVE',
    emittedAt: new Date(nowMs).toISOString(),
    expiresAt: deadline,
  };

  const published = input.store.publish(advisory);
  return {
    advisory: published.current,
    withdrawn: published.withdrawn,
  };
}

/** Visible projection — ACTIVE only; never show superseded/expired as actionable */
export function projectUserAdvisoryForViewer(input: {
  advisory: UserTemporalAdvisory;
  authorization: SelectedUserTemporalAdvisoryAuthorizationApproved;
  consent: UserOptInConsentStore;
  userId: string;
  currentContextRevision: number;
  activePredictionId?: string;
  activePredictionVersion?: string;
}):
  | {
      view: UserTemporalAdvisory;
      sections: UserTemporalAdvisory['display'];
      banner: UserTemporalAdvisory['experimentBanner'];
    }
  | { skipped: string }
  | { withdrawalNotice: string; status: UserTemporalAdvisory['status'] } {
  if (isOntologyP2UserAdvisoryKillSwitchEngaged()) {
    return { skipped: 'USER_ADVISORY_KILL_SWITCH' };
  }
  if (input.advisory.userId !== input.userId) {
    return { skipped: 'WRONG_USER' };
  }
  if (!input.consent.hasValidOptIn(input.userId, input.advisory.tripId)) {
    return { skipped: 'CONSENT_NOT_MATCHED' };
  }
  if (!isApprovedSelectedTrip(input.advisory.tripId)) {
    return { skipped: 'TRIP_NOT_SELECTED' };
  }

  if (input.advisory.status === 'WITHDRAWN' || input.advisory.status === 'SUPERSEDED') {
    return {
      withdrawalNotice:
        input.advisory.withdrawalNotice ??
        '预测已更新。此前建议已撤回。最新预测显示暂时无需调整。',
      status: input.advisory.status,
    };
  }
  if (input.advisory.status === 'EXPIRED') {
    return { skipped: 'EXPIRED_NOT_ACTIONABLE' };
  }
  if (input.advisory.status !== 'ACTIVE') {
    return { skipped: `advisory_status_${input.advisory.status}` };
  }
  if (input.advisory.contextRevision !== input.currentContextRevision) {
    return { skipped: 'prediction_context_mismatch' };
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

  return {
    view: input.advisory,
    sections: input.advisory.display,
    banner: input.advisory.experimentBanner,
  };
}

/**
 * Enter existing planning flow — never a P2 write shortcut.
 * Returns handoff token only; caller must use Decision → Preview → Canonical Assessment → Confirm → Apply.
 */
export function enterExistingPlanningFlowFromUserAdvisory(advisory: UserTemporalAdvisory): {
  handoff: 'DECISION_PREVIEW_CANONICAL_ASSESSMENT_CONFIRM_APPLY';
  advisoryId: string;
  tripId: string;
  forbiddenShortcut: true;
} {
  return {
    handoff: 'DECISION_PREVIEW_CANONICAL_ASSESSMENT_CONFIRM_APPLY',
    advisoryId: advisory.advisoryId,
    tripId: advisory.tripId,
    forbiddenShortcut: true,
  };
}
