/**
 * Iceland Wind Pilot Validation — pass criteria (not just jest PASS).
 */

import type { IcelandWindPilotEvidence } from './wind-pilot.types';
import type { WindPilotPassCriteria } from './wind-pilot.types';
import { assertTravelCausalDecisionComplete } from '../../harness/assert-travel-causal-decision.util';
import { projectCausalDecisionCard } from '../../projectors/causal-decision-card.projector';

export const DEFAULT_WIND_PILOT_PASS_CRITERIA: WindPilotPassCriteria = {
  highRiskMissRateMax: 0,
  duplicateRootCardMax: 0,
  derivedAsRootMax: 0,
  recommendedValidationPassRateMin: 1,
  newHardConflictsAfterApplyMax: 0,
};

export interface WindPilotCaseReport {
  caseId: string;
  ok: boolean;
  errors: string[];
}

export interface WindPilotSuiteReport {
  ok: boolean;
  caseReports: WindPilotCaseReport[];
  metrics: {
    caseCount: number;
    singleRootCardRate: number;
    recommendedValidationPassRate: number;
    deadlineBeforeIrreparableRate: number;
    incompleteObsUnobservableRate: number;
    applyNotAutoConfirmRate: number;
  };
  errors: string[];
}

function assertSingleRootCause(ev: IcelandWindPilotEvidence): string[] {
  const errors: string[] = [];
  const card = projectCausalDecisionCard(ev.decision);
  // One decision card — not multiple root titles
  if (!ev.expectedRootCauseSummaryZh.includes('强风')) {
    errors.push('expected root narrative must center on 强风');
  }
  // Derived chain steps must not look like separate root cards
  const chain = ev.decision.causalChain.map((c) => c.summary);
  const derivedRoots = ['驾驶速度下降', '到达延误', '签到风险'].filter((label) =>
    chain.some((s) => s === label),
  );
  // OK as chain steps; fail if observationSummary is ONLY a derived label
  const obs = ev.decision.observationSummary;
  if (
    /^(驾驶速度下降|到达延误|活动签到风险|后续日程受影响)[。.]?$/.test(obs.trim())
  ) {
    errors.push(`observationSummary looks like derived-only root: ${obs}`);
  }
  if (!card.whatHappened) errors.push('decision card missing whatHappened');
  if (derivedRoots.length && !obs.includes('风') && !obs.toLowerCase().includes('wind')) {
    // live assessment may be Chinese wind narrative
    if (!/风|gust|wind/i.test(obs)) {
      errors.push('root observation should mention wind/强风');
    }
  }
  return errors;
}

function assertTemporalValue(ev: IcelandWindPilotEvidence): string[] {
  const errors: string[] = [];
  const tf = ev.decision.temporalForecast;
  if (!tf.interventionDeadline) {
    errors.push('missing interventionDeadline');
    return errors;
  }
  if (tf.interventionDeadline > ev.irreparableAfterAt) {
    errors.push(
      `interventionDeadline ${tf.interventionDeadline} must be before irreparableAfterAt ${ev.irreparableAfterAt}`,
    );
  }
  if (tf.deteriorationAt && tf.interventionDeadline > tf.deteriorationAt) {
    errors.push('interventionDeadline should be ≤ deteriorationAt');
  }
  if (ev.archetype === 'FORECAST_CHANGE_STALE_CONTEXT') {
    if (!ev.decision.contextHash.startsWith('stale_') && !ev.decision.observationSummary.includes('重算')) {
      errors.push('stale-context case must mark stale contextHash or 重算 narrative');
    }
  }
  return errors;
}

function assertDoNothingBaseline(ev: IcelandWindPilotEvidence): string[] {
  const errors: string[] = [];
  if (ev.archetype === 'WIND_NO_IMPACT') return errors;
  const b = ev.decision.baselineOutcome;
  if (b.completionProbability == null) errors.push('baseline completionProbability required');
  if (!ev.decision.doNothingSummary) errors.push('doNothingSummary required');
  if (!ev.decision.temporalForecast.assumptions?.length) {
    errors.push('baseline assumptions required');
  }
  return errors;
}

function assertRecommendationExecutable(ev: IcelandWindPilotEvidence): string[] {
  const errors: string[] = [];
  if (ev.archetype === 'WIND_NO_IMPACT') return errors;
  const recId = ev.decision.recommendation?.optionId;
  if (!recId) {
    // Irrecoverable may still recommend reschedule/cancel-like option
    if (ev.decision.interventions.length === 0) {
      errors.push('no interventions for actionable archetype');
    }
    return errors;
  }
  const opt = ev.decision.interventions.find((i) => i.optionId === recId);
  if (!opt) {
    errors.push('recommendation option missing');
    return errors;
  }
  if (opt.validation.overall === 'FAIL') {
    errors.push('recommended option validation FAIL');
  }
  const failed = opt.validation.checks.filter((c) => c.status === 'FAIL');
  if (failed.length) {
    errors.push(`recommended checks FAIL: ${failed.map((c) => c.checkId).join(',')}`);
  }
  return errors;
}

function assertReconciliationHonesty(ev: IcelandWindPilotEvidence): string[] {
  const errors: string[] = [];
  if (ev.archetype === 'INCOMPLETE_OBSERVATION' || ev.observation.kind === 'NONE') {
    if (
      ev.finalReconciliation === 'CONFIRMED' ||
      ev.decision.outcome?.reconciliation === 'CONFIRMED'
    ) {
      errors.push('must not CONFIRMED without observation');
    }
    if (
      ev.archetype === 'INCOMPLETE_OBSERVATION' &&
      ev.finalReconciliation !== 'UNOBSERVABLE' &&
      ev.finalReconciliation !== 'PENDING'
    ) {
      errors.push(`incomplete obs expected UNOBSERVABLE|PENDING, got ${ev.finalReconciliation}`);
    }
  }
  // Apply path: selected but if we had NONE before reconcile, outcome should not be CONFIRMED from select alone
  if (ev.selectedOptionId && ev.observation.kind === 'NONE') {
    if (ev.decision.outcome?.reconciliation === 'CONFIRMED') {
      errors.push('select/apply must not auto-CONFIRMED');
    }
  }
  return errors;
}

export function evaluateWindPilotCase(ev: IcelandWindPilotEvidence): WindPilotCaseReport {
  const errors: string[] = [];
  const contract = assertTravelCausalDecisionComplete(ev.decision);
  // No-impact cases may have fewer interventions — filter that strictness
  const contractErrors =
    ev.archetype === 'WIND_NO_IMPACT'
      ? contract.errors.filter((e) => !e.includes('at least 2 interventions'))
      : contract.errors;
  errors.push(...contractErrors);
  errors.push(...assertSingleRootCause(ev));
  errors.push(...assertTemporalValue(ev));
  errors.push(...assertDoNothingBaseline(ev));
  errors.push(...assertRecommendationExecutable(ev));
  errors.push(...assertReconciliationHonesty(ev));

  // Evidence completeness
  if (!ev.ruleVersion) errors.push('ruleVersion required');
  if (!ev.contextHash) errors.push('contextHash required');
  if (!ev.factSnapshot) errors.push('factSnapshot required');

  return { caseId: ev.caseId, ok: errors.length === 0, errors };
}

export function evaluateWindPilotSuite(
  cases: IcelandWindPilotEvidence[],
  criteria: WindPilotPassCriteria = DEFAULT_WIND_PILOT_PASS_CRITERIA,
): WindPilotSuiteReport {
  const caseReports = cases.map(evaluateWindPilotCase);
  const errors: string[] = [];

  const actionable = cases.filter((c) => c.archetype !== 'WIND_NO_IMPACT');
  const withRec = actionable.filter((c) => c.decision.recommendation);
  const recPass = withRec.filter((c) => {
    const opt = c.decision.interventions.find(
      (i) => i.optionId === c.decision.recommendation!.optionId,
    );
    return opt && opt.validation.overall !== 'FAIL';
  });

  const deadlineOk = cases.filter(
    (c) =>
      c.decision.temporalForecast.interventionDeadline &&
      c.decision.temporalForecast.interventionDeadline <= c.irreparableAfterAt,
  );

  const incomplete = cases.filter((c) => c.archetype === 'INCOMPLETE_OBSERVATION');
  const incompleteOk = incomplete.filter(
    (c) => c.finalReconciliation === 'UNOBSERVABLE' || c.finalReconciliation === 'PENDING',
  );

  const selectedNoObs = cases.filter(
    (c) => c.selectedOptionId && c.observation.kind === 'NONE',
  );
  const notAutoConfirm = selectedNoObs.filter(
    (c) => c.decision.outcome?.reconciliation !== 'CONFIRMED',
  );

  const metrics = {
    caseCount: cases.length,
    singleRootCardRate: caseReports.filter((r) => r.ok || !r.errors.some((e) => e.includes('derived'))).length / cases.length,
    recommendedValidationPassRate: withRec.length ? recPass.length / withRec.length : 1,
    deadlineBeforeIrreparableRate: cases.length ? deadlineOk.length / cases.length : 1,
    incompleteObsUnobservableRate: incomplete.length
      ? incompleteOk.length / incomplete.length
      : 1,
    applyNotAutoConfirmRate: selectedNoObs.length
      ? notAutoConfirm.length / selectedNoObs.length
      : 1,
  };

  if (metrics.recommendedValidationPassRate < criteria.recommendedValidationPassRateMin) {
    errors.push(
      `recommendedValidationPassRate ${metrics.recommendedValidationPassRate} < ${criteria.recommendedValidationPassRateMin}`,
    );
  }
  if (metrics.deadlineBeforeIrreparableRate < 1) {
    errors.push(
      `deadlineBeforeIrreparableRate ${metrics.deadlineBeforeIrreparableRate} < 1`,
    );
  }
  if (metrics.incompleteObsUnobservableRate < 1) {
    errors.push('incomplete observations must not auto-confirm');
  }
  if (metrics.applyNotAutoConfirmRate < 1) {
    errors.push('apply/select must not auto-CONFIRMED without observation');
  }

  const failedCases = caseReports.filter((r) => !r.ok);
  for (const f of failedCases) {
    errors.push(`${f.caseId}: ${f.errors.join('; ')}`);
  }

  return {
    ok: errors.length === 0 && failedCases.length === 0,
    caseReports,
    metrics,
    errors,
  };
}
