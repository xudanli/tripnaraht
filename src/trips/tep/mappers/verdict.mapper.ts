/**
 * Legacy verdict → TEP RuleOutcome / ExecutabilityStatus
 * @see internal-docs/product/TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md 附录 A
 */

import type {
  ExecutabilityStatus,
  PlanningRuleResult,
  RuleOutcome,
  RuleSeverity,
} from '../contracts/tep-self-drive.types';

const OUTCOME_RANK: Record<RuleOutcome, number> = {
  REJECT: 6,
  SUGGEST_REPAIR: 5,
  NEED_CONFIRM: 4,
  CAUTION: 3,
  UNKNOWN: 2,
  PASS: 1,
};

const SEVERITY_RANK: Record<RuleSeverity, number> = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  INFO: 1,
};

export function fromPackRule(result: {
  verdict: string;
  overridable?: boolean;
}): Pick<PlanningRuleResult, 'outcome' | 'severity'> {
  const verdict = result.verdict.toUpperCase();
  if (verdict === 'BLOCK') {
    return result.overridable
      ? { outcome: 'NEED_CONFIRM', severity: 'HIGH' }
      : { outcome: 'REJECT', severity: 'CRITICAL' };
  }
  if (verdict === 'WARNING') {
    return result.overridable
      ? { outcome: 'CAUTION', severity: 'MEDIUM' }
      : { outcome: 'SUGGEST_REPAIR', severity: 'HIGH' };
  }
  return { outcome: 'UNKNOWN', severity: 'HIGH' };
}

export function fromFeasibilityPriority(priority: string, type?: string): Pick<PlanningRuleResult, 'outcome' | 'severity'> {
  if (priority === 'must_handle') {
    if (type === 'blocker') {
      return { outcome: 'REJECT', severity: 'CRITICAL' };
    }
    return { outcome: 'SUGGEST_REPAIR', severity: 'HIGH' };
  }
  if (priority === 'suggest_adjust') {
    return { outcome: 'SUGGEST_REPAIR', severity: 'MEDIUM' };
  }
  if (priority === 'pending_confirm') {
    return { outcome: 'NEED_CONFIRM', severity: 'MEDIUM' };
  }
  return { outcome: 'CAUTION', severity: 'LOW' };
}

export function fromConstraintEnforcement(
  enforcement: string,
): Pick<PlanningRuleResult, 'outcome' | 'severity'> {
  switch (enforcement) {
    case 'BLOCK':
      return { outcome: 'REJECT', severity: 'CRITICAL' };
    case 'REQUIRE_ADJUSTMENT':
      return { outcome: 'SUGGEST_REPAIR', severity: 'HIGH' };
    case 'REQUIRE_CONFIRMATION':
      return { outcome: 'NEED_CONFIRM', severity: 'MEDIUM' };
    case 'WARN':
      return { outcome: 'CAUTION', severity: 'MEDIUM' };
    case 'INFORM':
    default:
      return { outcome: 'PASS', severity: 'INFO' };
  }
}

export function pickStricterOutcome(a: RuleOutcome, b: RuleOutcome): RuleOutcome {
  return OUTCOME_RANK[a] >= OUTCOME_RANK[b] ? a : b;
}

export function pickHigherSeverity(a: RuleSeverity, b: RuleSeverity): RuleSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

/** 附录 A.7 + 工程契约 §4 — Executability 最终裁决 */
export function aggregateExecutabilityStatus(
  ruleResults: Array<Pick<PlanningRuleResult, 'outcome' | 'severity'>>,
): ExecutabilityStatus {
  if (!ruleResults.length) {
    return 'EXECUTABLE';
  }

  let worstOutcome: RuleOutcome = 'PASS';
  let worstSeverity: RuleSeverity = 'INFO';

  for (const r of ruleResults) {
    worstOutcome = pickStricterOutcome(worstOutcome, r.outcome);
    worstSeverity = pickHigherSeverity(worstSeverity, r.severity);
  }

  if (worstOutcome === 'REJECT') {
    return 'NOT_EXECUTABLE';
  }
  if (worstOutcome === 'UNKNOWN' && SEVERITY_RANK[worstSeverity] >= SEVERITY_RANK.HIGH) {
    return 'UNKNOWN';
  }
  if (worstOutcome === 'SUGGEST_REPAIR') {
    return 'REQUIRES_REPAIR';
  }
  if (worstOutcome === 'NEED_CONFIRM') {
    return 'REQUIRES_CONFIRMATION';
  }
  if (worstOutcome === 'CAUTION') {
    return 'EXECUTABLE_WITH_CAUTION';
  }
  return 'EXECUTABLE';
}
