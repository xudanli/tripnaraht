/**
 * Feasibility report issues → TEP ExecutabilityAssessment
 */

import type { FeasibilityIssueDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import type {
  ExecutabilityAssessment,
  PlanningRuleResult,
  ValidationFinding,
} from '../contracts/tep-self-drive.types';
import { EXECUTABILITY_ASSESSMENT_SCHEMA } from '../contracts/tep-self-drive.types';
import {
  aggregateExecutabilityStatus,
  fromFeasibilityPriority,
} from './verdict.mapper';
import { resolveSdrRuleId } from './sdr-rule-id.mapper';

function isBlockerIssue(issue: FeasibilityIssueDto): boolean {
  if (issue.priority !== 'must_handle') return false;
  if (issue.severity === 'high') return true;
  const kind = String(issue.issueKind ?? '');
  return (
    kind === 'poi_access_blocked' ||
    kind === 'road_class' ||
    kind.includes('blocked')
  );
}

export function mapFeasibilityIssueToRuleResult(
  issue: FeasibilityIssueDto,
  countryCode?: string,
): PlanningRuleResult {
  const packRuleId = issue.proofs?.[0]?.ruleId;
  const ruleId = resolveSdrRuleId({
    packRuleId,
    semanticKey: issue.semanticKey ?? issue.proofs?.[0]?.semanticKey,
    issueKind: issue.issueKind,
    countryCode,
  });

  const mapped = fromFeasibilityPriority(
    issue.priority,
    isBlockerIssue(issue) ? 'blocker' : undefined,
  );

  const affectedRefs: string[] = [];
  if (issue.fromItemId) affectedRefs.push(issue.fromItemId);
  if (issue.toItemId) affectedRefs.push(issue.toItemId);
  if (issue.tripDayId) affectedRefs.push(issue.tripDayId);
  for (const day of issue.affectedDays ?? []) {
    affectedRefs.push(`day_${day}`);
  }

  return {
    ruleId,
    outcome: mapped.outcome,
    severity: mapped.severity,
    affectedRefs,
    explanation: issue.message,
    evidenceRefs: (issue.proofs ?? []).map((proof) => ({
      provider: proof.evidenceSource || 'INTERNAL',
      sourceType: 'INTERNAL' as const,
      observedAt: proof.observedAt ?? new Date().toISOString(),
      validUntil: proof.validUntil,
      predicate: proof.constraint,
      confidence: proof.confidence,
    })),
  };
}

export function mapFeasibilityIssuesToAssessment(input: {
  tripId: string;
  issues: FeasibilityIssueDto[];
  packId: string;
  packVersion: string;
  planVersionRef?: string;
  countryCode?: string;
  evaluatedAt?: string;
}): ExecutabilityAssessment {
  const ruleResults = input.issues.map((issue) =>
    mapFeasibilityIssueToRuleResult(issue, input.countryCode),
  );

  const status = aggregateExecutabilityStatus(ruleResults);
  const findings: ValidationFinding[] = ruleResults.map((rule, index) => ({
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
    ruleResults,
    evidenceRefs: ruleResults.flatMap((r) => r.evidenceRefs),
    evaluatedAt: input.evaluatedAt ?? new Date().toISOString(),
    planVersionRef: input.planVersionRef,
    packId: input.packId,
    packVersion: input.packVersion,
  };
}
