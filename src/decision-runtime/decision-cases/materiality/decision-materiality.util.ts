/**
 * Detection → Eligibility → Materiality 三闸。
 * 分数 0–2 不准 publish；3–5 默认 opportunity；6–8 IMPORTANT；9+ / BLOCKING 必须。
 */

import type {
  DecisionCaseRequiredness,
  DecisionCaseUiGroup,
  DecisionMaterialityBreakdown,
  DecisionMaterialityScore,
} from '../contracts/decision-case.types';

export function sumMaterialityBreakdown(
  breakdown: DecisionMaterialityBreakdown,
): number {
  return (
    breakdown.budget +
    breakdown.time +
    breakdown.safety +
    breakdown.fitness +
    breakdown.team +
    breakdown.bookingUrgency +
    breakdown.irreversibility
  );
}

export function buildMaterialityScore(
  breakdown: DecisionMaterialityBreakdown,
): DecisionMaterialityScore {
  const clamped: DecisionMaterialityBreakdown = {
    budget: clampDim(breakdown.budget),
    time: clampDim(breakdown.time),
    safety: clampDim(breakdown.safety),
    fitness: clampDim(breakdown.fitness),
    team: clampDim(breakdown.team),
    bookingUrgency: clampDim(breakdown.bookingUrgency),
    irreversibility: clampDim(breakdown.irreversibility),
  };
  return { total: sumMaterialityBreakdown(clamped), breakdown: clamped };
}

function clampDim(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(3, Math.round(n));
}

export function inferRequirednessFromMateriality(
  score: number,
  forceBlocking?: boolean,
): DecisionCaseRequiredness {
  if (forceBlocking) return 'BLOCKING';
  if (score >= 9) return 'BLOCKING';
  if (score >= 6) return 'IMPORTANT';
  return 'OPTIONAL';
}

/** 只有过门槛才可 status=OPEN 出现在 problems */
export function passesMaterialityPublishGate(input: {
  eligible: boolean;
  materialityTotal: number;
  forceBlocking?: boolean;
}): boolean {
  if (!input.eligible) return false;
  if (input.forceBlocking) return true;
  return input.materialityTotal >= 6;
}

/**
 * 三闸汇总：Detection → Eligibility → Materiality。
 * detected=false 时不产出；ineligible 可留 opportunity；materiality<6 默认 opportunity-only。
 */
export function evaluateThreeGatePublish(input: {
  detected: boolean;
  eligible: boolean;
  materialityTotal: number;
  forceBlocking?: boolean;
  ineligibilityReason?: string;
}): {
  publish: boolean;
  stayOpportunity: boolean;
  drop: boolean;
  reason?: string;
} {
  if (!input.detected) {
    return { publish: false, stayOpportunity: false, drop: true, reason: 'not_detected' };
  }
  if (!input.eligible) {
    return {
      publish: false,
      stayOpportunity: true,
      drop: false,
      reason: input.ineligibilityReason ?? 'ineligible',
    };
  }
  if (
    passesMaterialityPublishGate({
      eligible: true,
      materialityTotal: input.materialityTotal,
      forceBlocking: input.forceBlocking,
    })
  ) {
    return { publish: true, stayOpportunity: false, drop: false };
  }
  return {
    publish: false,
    stayOpportunity: true,
    drop: false,
    reason: 'below_materiality_threshold',
  };
}

export function shouldStayOpportunityOnly(materialityTotal: number): boolean {
  return materialityTotal <= 5;
}

export function mapRequirednessToUiGroup(
  requiredness: DecisionCaseRequiredness,
  materialityTotal?: number,
): DecisionCaseUiGroup {
  if (requiredness === 'BLOCKING') return 'MUST_CONFIRM';
  if (requiredness === 'IMPORTANT') return 'IMPORTANT_CHOICE';
  if (materialityTotal != null && materialityTotal >= 6) return 'IMPORTANT_CHOICE';
  return 'WORTH_CONSIDERING';
}

export function emptyMaterialityBreakdown(): DecisionMaterialityBreakdown {
  return {
    budget: 0,
    time: 0,
    safety: 0,
    fitness: 0,
    team: 0,
    bookingUrgency: 0,
    irreversibility: 0,
  };
}
