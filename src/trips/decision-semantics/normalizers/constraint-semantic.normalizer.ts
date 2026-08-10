/**
 * Maps legacy feasibility / gate severity to unified ConstraintAssertion semantics.
 */

import type {
  ConstraintAssertion,
  ConstraintDomain,
  ConstraintEnforcement,
  ConstraintNature,
  ConstraintSourceSystem,
  EvidenceReference,
} from '../types/decision-semantics.types';
import type { FeasibilityIssueDto, FeasibilityProofDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';

export function proofToEvidenceReference(proof: FeasibilityProofDto, index: number): EvidenceReference {
  return {
    id: proof.ruleId ?? `ev_${index}`,
    entity: proof.entity,
    constraint: proof.constraint,
    currentFact: proof.currentFact,
    evidenceSource: proof.evidenceSource,
    evidenceType: proof.evidenceType,
    observedAt: proof.observedAt,
    validUntil: proof.validUntil,
    ruleId: proof.ruleId,
    confidence: proof.confidence,
    conclusion: proof.conclusion,
  };
}

export function mapCategoryToDomain(category: string): ConstraintDomain {
  const c = category.toLowerCase();
  if (c.includes('team') || c === 'team_fit') return 'TEAM_FIT';
  if (c.includes('transport') || c.includes('route')) return 'ROUTE';
  if (c.includes('environment') || c.includes('weather')) return 'WEATHER';
  if (c.includes('booking') || c.includes('access')) return 'ACCESS';
  if (c.includes('budget')) return 'BUDGET';
  if (c.includes('schedule') || c.includes('time')) return 'TIME';
  if (c.includes('safety')) return 'SAFETY';
  if (c.includes('energy') || c.includes('fatigue') || c.includes('drive')) return 'ENERGY';
  return 'ROUTE';
}

export function inferNatureFromIssue(issue: FeasibilityIssueDto): ConstraintNature {
  if (issue.priority === 'must_handle' && issue.severity === 'high') {
    if (issue.issueKind?.includes('risk') || issue.category === 'environment') {
      return 'RISK_PREDICTION';
    }
    return 'HARD_CONSTRAINT';
  }
  if (issue.category === 'team_fit' || issue.issueKind?.includes('preference')) {
    return 'SOFT_CONSTRAINT';
  }
  if (issue.proofs?.some((p) => p.evidenceType === 'coverage-gap')) {
    return 'INFORMATION_GAP';
  }
  if (issue.priority === 'suggest_adjust') {
    return 'SOFT_CONSTRAINT';
  }
  if (issue.issueKind?.includes('risk') || issue.category === 'environment') {
    return 'RISK_PREDICTION';
  }
  return issue.priority === 'must_handle' ? 'HARD_CONSTRAINT' : 'SOFT_CONSTRAINT';
}

export function inferEnforcement(
  nature: ConstraintNature,
  priority: FeasibilityIssueDto['priority'],
  issue?: Pick<FeasibilityIssueDto, 'id' | 'title' | 'message' | 'issueKind'>,
): ConstraintEnforcement {
  if (issue && isReadinessInformIssue(issue)) {
    return 'INFORM';
  }
  if (nature === 'INFORMATION_GAP') {
    return priority === 'must_handle' ? 'REQUIRE_ADJUSTMENT' : 'INFORM';
  }
  if (nature === 'HARD_CONSTRAINT' || priority === 'must_handle') {
    return 'BLOCK';
  }
  if (nature === 'RISK_PREDICTION') {
    return 'REQUIRE_CONFIRMATION';
  }
  if (priority === 'suggest_adjust') {
    // Soft schedule tips (缓冲偏紧) → WARN; do not clog 待决策 as REQUIRE_ADJUSTMENT.
    return 'WARN';
  }
  return 'WARN';
}

export function isOverridable(
  nature: ConstraintNature,
  enforcement: ConstraintEnforcement,
  issueKind?: string,
): boolean {
  if (enforcement === 'BLOCK' && nature === 'HARD_CONSTRAINT') {
    if (issueKind?.includes('official') || issueKind?.includes('froad')) {
      return false;
    }
    if (issueKind === 'daily_drive' || issueKind?.includes('segment_distance')) {
      return false;
    }
    return false;
  }
  if (nature === 'INFORMATION_GAP') return true;
  if (nature === 'SOFT_CONSTRAINT') return true;
  if (nature === 'RISK_PREDICTION') return true;
  return enforcement !== 'BLOCK';
}

export function buildAssertionFromFeasibilityIssue(
  issue: FeasibilityIssueDto,
  tripId: string,
): ConstraintAssertion {
  const nature = inferNatureFromIssue(issue);
  const enforcement = inferEnforcement(nature, issue.priority, issue);
  const overridable = isOverridable(nature, enforcement, issue.issueKind);
  const domain = mapCategoryToDomain(String(issue.category));
  const proofs = (issue.proofs ?? []).map(proofToEvidenceReference);

  return {
    id: `ca_${issue.id}`,
    sourceSystem: 'FEASIBILITY' satisfies ConstraintSourceSystem,
    sourceRefId: issue.id,
    nature,
    domain,
    enforcement,
    overridable,
    overridePolicy: overridable
      ? { allowedBy: ['TRIP_OWNER'], requiresReason: true }
      : undefined,
    condition: issue.actionRequired ?? issue.title,
    conclusion: issue.message,
    proofs,
  };
}

export function inferProblemType(issue: FeasibilityIssueDto): import('../types/decision-semantics.types').DecisionProblemType {
  if (issue.category === 'team_fit') return 'PREFERENCE_CONFLICT';
  if (issue.proofs?.some((p) => p.evidenceType === 'coverage-gap')) return 'DATA_UNCERTAINTY';
  if (issue.issueKind?.includes('budget')) return 'RESOURCE_CONFLICT';
  if (issue.priority === 'must_handle') return 'INFEASIBILITY';
  if (issue.category === 'environment' || issue.issueKind?.includes('risk')) return 'RISK';
  if (issue.priority === 'suggest_adjust') return 'RISK';
  return 'INFEASIBILITY';
}

export function inferProblemStatus(
  issue: FeasibilityIssueDto,
): import('../types/decision-semantics.types').DecisionProblemStatus {
  if (issue.priority === 'pending_confirm') return 'WAITING_DECISION';
  if (issue.priority === 'must_handle') return 'OPEN';
  return 'ASSESSING';
}

export function stableProblemId(issue: FeasibilityIssueDto): string {
  const key = issue.semanticKey ?? buildFeasibilitySemanticKey(issue);
  return key.startsWith('dp_') ? key : `dp_${key.replace(/^issue-/, '')}`;
}

export function buildFeasibilitySemanticKey(issue: FeasibilityIssueDto): string {
  if (isReadinessInformIssue(issue)) return 'READINESS_SAFETY_EMERGENCY';
  if (issue.issueKind === 'buffer_insufficient' || /缓冲/.test(issue.title)) {
    return 'INSUFFICIENT_TRANSFER_BUFFER';
  }
  if (issue.issueKind === 'meeting_point_buffer') {
    return 'MEETING_POINT_BUFFER_INSUFFICIENT';
  }
  if (issue.issueKind === 'product_session_time_window') {
    return 'PRODUCT_SESSION_LOCK_VIOLATION';
  }
  if (issue.issueKind === 'product_participant_eligibility') {
    return 'PRODUCT_ELIGIBILITY_FAILED';
  }
  if (issue.issueKind === 'product_weather_dependency') {
    return 'PRODUCT_WEATHER_HOLD_REQUIRED';
  }
  if (issue.issueKind?.includes('daily_drive') || /驾驶/.test(issue.title)) {
    return 'EXCESSIVE_DAILY_LOAD';
  }
  if (issue.issueKind?.includes('duplicate') || /重复/.test(issue.title)) {
    return 'DUPLICATE_ITINERARY_ITEM';
  }
  if (issue.id.includes('coverage-gap') || issue.proofs?.some((p) => p.evidenceType === 'coverage-gap')) {
    return 'ITINERARY_COVERAGE_GAP';
  }
  return issue.id;
}

export function isReadinessInformIssue(
  issue: Pick<FeasibilityIssueDto, 'id' | 'title' | 'message' | 'issueKind'>,
): boolean {
  const blob = `${issue.id} ${issue.title} ${issue.message}`.toLowerCase();
  return /紧急电话|emergency|safety\.emergency|issue-finding.*emergency/.test(blob);
}

export function buildProblemIdFromRef(problemId: string, tripId: string): boolean {
  return problemId.length > 0 && tripId.length > 0;
}
