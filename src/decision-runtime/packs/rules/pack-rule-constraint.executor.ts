/**
 * RFC-002 Phase 2 — declarative pack rules → constraint evaluation material.
 * Pure function; no Guardian / Decision Core coupling.
 */

import { isDestinationPackRulesEnabled } from '../config/destination-pack.config';
import { loadCountryPackRules } from './pack-rule-bundle.loader';
import { applyPackRuleToCandidate, findFirstMatchingPackRule } from './pack-rule-evaluator';
import type {
  PackConstraintEvaluation,
  PackRuleConstraintInput,
} from './pack-rule-constraint.types';

const DEFAULT_RULE_VERSION_PREFIX = 'pack-rule-constraint@v1';

export function executePackRuleConstraint(
  input: PackRuleConstraintInput,
): PackConstraintEvaluation | undefined {
  if (!isDestinationPackRulesEnabled()) return undefined;

  const country = input.country.trim();
  const rules = loadCountryPackRules(country);
  if (!rules.length) return undefined;

  const ctx = {
    country,
    facts: input.facts,
    candidateUsesRoute: input.candidateUsesRoute,
  };

  const rule = findFirstMatchingPackRule(rules, ctx, input.semanticKey);
  if (!rule) return undefined;

  const applied = applyPackRuleToCandidate(rule, ctx);
  if (!applied) return undefined;

  const prefix = input.ruleVersionPrefix ?? DEFAULT_RULE_VERSION_PREFIX;
  const verdict =
    applied.verdict === 'PASS' ? 'PASS' : (applied.verdict as PackConstraintEvaluation['verdict']);

  const evaluation: PackConstraintEvaluation = {
    matched: true,
    ruleId: applied.ruleId,
    semanticKey: applied.semanticKey,
    verdict,
    constraintCode: applied.constraintCode,
    reasonCodes: applied.reasonCode ? [applied.reasonCode] : [],
    overridable: applied.overridable,
    ruleVersion: `${prefix}+pack:${applied.ruleId}`,
  };

  if (verdict === 'WARNING') {
    evaluation.recoveryConditions = [
      {
        code: 'CONDITIONAL_PASSAGE',
        description:
          'Restricted passage may apply (vehicle class, season, or time window)',
        evidenceRefs: [],
      },
    ];
  }

  return evaluation;
}

/** Merge pack evaluation into a constraint assertion envelope (RFC-001 workspace shape). */
export function applyPackEvaluationToAssertionEnvelope<T extends Record<string, unknown>>(
  base: T,
  evaluation: PackConstraintEvaluation,
): T {
  return {
    ...base,
    verdict: evaluation.verdict,
    constraintCode: evaluation.constraintCode,
    reasonCodes: evaluation.reasonCodes,
    overridable: evaluation.overridable,
    ruleVersion: evaluation.ruleVersion,
    recoveryConditions:
      evaluation.recoveryConditions?.length
        ? evaluation.recoveryConditions.map((rc) => ({
            ...rc,
            evidenceRefs: rc.evidenceRefs,
          }))
        : undefined,
  };
}
