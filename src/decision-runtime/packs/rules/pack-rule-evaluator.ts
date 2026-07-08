/**
 * RFC-002 — evaluate declarative pack rules against fact context (pure, no I/O).
 */

import type {
  DestinationPackRule,
  RuleEvaluationFacts,
  RuleConditionOperator,
} from './destination-rule.types';

function readFact(facts: Record<string, unknown>, field: string): unknown {
  const parts = field.split('.');
  let cur: unknown = facts;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function evalCondition(
  facts: Record<string, unknown>,
  cond: { field: string; operator: RuleConditionOperator; value?: unknown; values?: string[] },
): boolean {
  const actual = readFact(facts, cond.field);
  switch (cond.operator) {
    case 'EQ':
      return actual === cond.value;
    case 'NEQ':
      return actual !== cond.value;
    case 'GTE':
      return Number(actual) >= Number(cond.value);
    case 'LTE':
      return Number(actual) <= Number(cond.value);
    case 'IN':
      return cond.values?.includes(String(actual)) ?? false;
    default:
      return false;
  }
}

function ruleApplies(rule: DestinationPackRule, ctx: RuleEvaluationFacts): boolean {
  const country = ctx.country?.trim().toUpperCase();
  if (rule.appliesWhen?.country) {
    const allowed = rule.appliesWhen.country.trim().toUpperCase();
    const match =
      country === allowed ||
      (allowed === 'IS' && country === 'ICELAND') ||
      (allowed === 'ICELAND' && country === 'IS');
    if (!match) return false;
  }
  return rule.conditions.every((c) => evalCondition(ctx.facts, c));
}

export function findFirstMatchingPackRule(
  rules: DestinationPackRule[],
  ctx: RuleEvaluationFacts,
  semanticKey?: string,
): DestinationPackRule | undefined {
  return rules.find((rule) => {
    if (semanticKey && rule.semanticKey !== semanticKey) return false;
    return ruleApplies(rule, ctx);
  });
}

export interface AppliedPackRuleResult {
  ruleId: string;
  semanticKey: string;
  verdict: DestinationPackRule['result']['verdict'];
  reasonCode: string;
  overridable: boolean;
  constraintCode: string;
}

export function applyPackRuleToCandidate(
  rule: DestinationPackRule,
  ctx: RuleEvaluationFacts,
): AppliedPackRuleResult | undefined {
  if (!ruleApplies(rule, ctx)) return undefined;

  let verdict = rule.result.verdict;
  let constraintCode =
    rule.result.constraintCode ??
    (verdict === 'BLOCK'
      ? 'ROAD_CLOSED'
      : verdict === 'WARNING'
        ? 'ROAD_RESTRICTED'
        : 'ROAD_STATUS');

  if (rule.whenCandidateUsesRoute && !ctx.candidateUsesRoute) {
    if (verdict === 'BLOCK' || verdict === 'WARNING') {
      verdict = 'PASS';
      constraintCode = 'ROAD_BYPASS';
      return {
        ruleId: rule.ruleId,
        semanticKey: rule.semanticKey,
        verdict: 'PASS',
        reasonCode: '',
        overridable: true,
        constraintCode,
      };
    }
  }

  return {
    ruleId: rule.ruleId,
    semanticKey: rule.semanticKey,
    verdict,
    reasonCode: rule.result.reasonCode,
    overridable: rule.result.overridable,
    constraintCode,
  };
}
