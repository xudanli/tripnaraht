/**
 * PD-4 — Evaluate which lenses to activate for a Proactive Decision Case.
 */

import type { ProactiveDecisionCaseId } from '../contracts/proactive-decision-case.types';
import type { ProactiveWorldSignalKind } from '../contracts/proactive-impact.types';
import { domainOfProactiveSignal } from '../contracts/proactive-impact.types';
import {
  LENS_ACTIVATION_SCHEMA_ID,
  type LensActivationDecisionV1,
  type LensActivationSignalsV1,
  type LensActivationTrigger,
  type ProactiveLensId,
} from './lens-activation.types';

const ABU_TRIGGERS: ReadonlySet<string> = new Set([
  'safety_related',
  'feasibility_uncertain',
  'road_constraint',
  'weather_risk',
  'legality_constraint',
]);

const DRE_TRIGGERS: ReadonlySet<string> = new Set([
  'schedule_tradeoff',
  'fatigue',
  'experience_loss',
  'user_preference_conflict',
]);

const NEP_TRIGGERS: ReadonlySet<string> = new Set([
  'original_plan_failed',
  'utility_drop',
  'user_requested_change',
  'repair_required',
]);

/**
 * Derive default activation signals from Case + signal kind.
 * Callers may merge additional triggers (fatigue, preference, etc.).
 */
export function deriveDefaultLensSignals(input: {
  caseId: ProactiveDecisionCaseId;
  signalKind: ProactiveWorldSignalKind;
  needAlternative?: boolean;
  mustAdjust?: boolean;
  mustRepair?: boolean;
  hardBlocked?: boolean;
  extraTriggers?: LensActivationTrigger[];
}): LensActivationSignalsV1 {
  const triggers: LensActivationTrigger[] = [...(input.extraTriggers ?? [])];
  const domain = domainOfProactiveSignal(input.signalKind);

  if (domain === 'WEATHER') {
    triggers.push('weather_risk', 'safety_related', 'experience_loss');
  } else {
    triggers.push('road_constraint', 'feasibility_uncertain', 'safety_related');
  }

  if (input.caseId === 'CASE_CONTINUE_ACTIVITY') {
    triggers.push('schedule_tradeoff');
  }
  if (input.caseId === 'CASE_POSTPONE_ACTIVITY') {
    triggers.push('schedule_tradeoff', 'utility_drop');
  }
  if (input.caseId === 'CASE_REROUTE') {
    triggers.push('feasibility_uncertain', 'repair_required');
  }

  let needAlternative = input.needAlternative ?? false;
  if (input.caseId === 'CASE_REROUTE' || input.caseId === 'CASE_POSTPONE_ACTIVITY') {
    needAlternative = input.needAlternative ?? true;
  }
  if (input.mustRepair || input.mustAdjust || input.hardBlocked) {
    needAlternative = true;
  }
  if (input.mustRepair) {
    triggers.push('repair_required', 'original_plan_failed');
  }
  if (input.mustAdjust) {
    triggers.push('schedule_tradeoff', 'fatigue');
  }

  return {
    triggers: uniqueTriggers(triggers),
    needAlternative,
    mustAdjust: input.mustAdjust,
    mustRepair: input.mustRepair,
    hardBlocked: input.hardBlocked,
  };
}

function uniqueTriggers(
  triggers: LensActivationTrigger[],
): LensActivationTrigger[] {
  return [...new Set(triggers)];
}

/**
 * Lens Activation Policy evaluator.
 *
 * Weather default (RFC): Abu + Dr.Dre required; Neptune only if needAlternative.
 * mustAdjust / mustRepair: force full chain + post-repair recheck.
 */
export function evaluateLensActivation(
  signals: LensActivationSignalsV1,
): LensActivationDecisionV1 {
  const rationaleZh: string[] = [];
  const matched = signals.triggers;

  const abuHit = matched.some((t) => ABU_TRIGGERS.has(t));
  const dreHit = matched.some((t) => DRE_TRIGGERS.has(t));
  const nepHit = matched.some((t) => NEP_TRIGGERS.has(t));

  let activateAbu = abuHit;
  let activateDrDre = dreHit;
  let activateNeptune =
    nepHit || signals.needAlternative === true || signals.mustRepair === true;

  // RFC weather default: if weather_risk present, ensure Abu+Dre;
  // Neptune only when Need Alternative / repair triggers (unless forced below).
  if (matched.includes('weather_risk')) {
    activateAbu = true;
    activateDrDre = true;
    rationaleZh.push('天气风险默认：Abu + Dr.Dre 必参');
    if (!signals.needAlternative && !signals.mustRepair && !signals.mustAdjust && !nepHit) {
      activateNeptune = false;
      rationaleZh.push('Need Alternative=false：跳过 Neptune');
    }
  }

  // Country Pack hard requirements (override weather skip)
  if (signals.mustAdjust || signals.mustRepair) {
    activateAbu = true;
    activateDrDre = true;
    activateNeptune = true;
    rationaleZh.push(
      signals.mustRepair
        ? 'mustRepair：强制 Abu → Dr.Dre → Neptune → 再评估'
        : 'mustAdjust：强制 Abu → Dr.Dre → Neptune',
    );
  }

  // Weather/road V1 safety: never skip Abu when any feasibility/safety trigger present
  if (!activateAbu && (signals.hardBlocked || abuHit)) {
    activateAbu = true;
  }

  if (activateNeptune && (signals.needAlternative || signals.mustRepair)) {
    if (!rationaleZh.some((r) => r.includes('Neptune'))) {
      rationaleZh.push('Need Alternative / repair：激活 Neptune 生成替代');
    }
  }

  const lensOrder: ProactiveLensId[] = [];
  if (activateAbu) lensOrder.push('ABU');
  if (activateDrDre) lensOrder.push('DR_DRE');
  if (activateNeptune) lensOrder.push('NEPTUNE');

  if (lensOrder.length === 0) {
    // Degenerate: still require Abu for any decision path
    activateAbu = true;
    lensOrder.push('ABU');
    rationaleZh.push('兜底：至少激活 Abu');
  }

  const requirePostRepairRecheck =
    activateNeptune &&
    (signals.mustRepair === true || signals.mustAdjust === true);

  return {
    schemaId: LENS_ACTIVATION_SCHEMA_ID,
    version: 1,
    activateAbu,
    activateDrDre,
    activateNeptune,
    lensOrder,
    matchedTriggers: matched,
    rationaleZh,
    requirePostRepairRecheck,
  };
}

/**
 * Convenience: Case + signal → activation decision.
 */
export function planLensesForProactiveCase(input: {
  caseId: ProactiveDecisionCaseId;
  signalKind: ProactiveWorldSignalKind;
  needAlternative?: boolean;
  mustAdjust?: boolean;
  mustRepair?: boolean;
  hardBlocked?: boolean;
  extraTriggers?: LensActivationTrigger[];
}): LensActivationDecisionV1 {
  return evaluateLensActivation(deriveDefaultLensSignals(input));
}
