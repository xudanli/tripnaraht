/**
 * Build ExecutabilityAssessment from TEP Validator rule results.
 */

import type {
  ExecutabilityAssessment,
  PlanningRuleResult,
} from '../contracts/tep-self-drive.types';
import { EXECUTABILITY_ASSESSMENT_SCHEMA } from '../contracts/tep-self-drive.types';
import { aggregateExecutabilityStatus } from '../mappers/verdict.mapper';
import type { TepValidationInput } from './tep-validation.types';
import { runTepValidation } from './sdr-rule-evaluators';

export function buildExecutabilityAssessmentFromRuleResults(input: {
  tripId: string;
  ruleResults: PlanningRuleResult[];
  packId: string;
  packVersion: string;
  planVersionRef?: string;
  evaluatedAt?: string;
}): ExecutabilityAssessment {
  const status = aggregateExecutabilityStatus(input.ruleResults);
  const findings = input.ruleResults.map((rule, index) => ({
    findingId: `finding_${input.tripId}_${index}`,
    ruleId: rule.ruleId,
    outcome: rule.outcome,
    severity: rule.severity,
    message: rule.explanation,
    affectedRefs: rule.affectedRefs,
  }));

  return {
    schemaId: EXECUTABILITY_ASSESSMENT_SCHEMA,
    status,
    findings,
    ruleResults: input.ruleResults,
    evidenceRefs: input.ruleResults.flatMap((r) => r.evidenceRefs),
    evaluatedAt: input.evaluatedAt ?? new Date().toISOString(),
    planVersionRef: input.planVersionRef,
    packId: input.packId,
    packVersion: input.packVersion,
  };
}

export function validateTepPlanningSnapshot(input: TepValidationInput): ExecutabilityAssessment {
  const country = input.countryCode.toUpperCase();
  const ruleResults = runTepValidation(input);
  return buildExecutabilityAssessmentFromRuleResults({
    tripId: input.tripId,
    ruleResults,
    packId: input.packId ?? `destination.${country.toLowerCase()}`,
    packVersion: input.packVersion ?? '1.0.0',
    planVersionRef: input.planVersionRef,
    evaluatedAt: input.evaluatedAt,
  });
}

export function mergePlanningRuleResults(
  primary: PlanningRuleResult[],
  secondary: PlanningRuleResult[],
): PlanningRuleResult[] {
  const byKey = new Map<string, PlanningRuleResult>();
  for (const result of [...primary, ...secondary]) {
    const key = `${result.ruleId}:${result.affectedRefs.join('|')}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, result);
      continue;
    }
    const outcomeRank: Record<string, number> = {
      REJECT: 6,
      SUGGEST_REPAIR: 5,
      NEED_CONFIRM: 4,
      CAUTION: 3,
      UNKNOWN: 2,
      PASS: 1,
    };
    if ((outcomeRank[result.outcome] ?? 0) > (outcomeRank[existing.outcome] ?? 0)) {
      byKey.set(key, result);
    }
  }
  return [...byKey.values()];
}
