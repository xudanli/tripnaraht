/**
 * TripConstraint → DecisionProblem + ConstraintAssertion (read-only mapping).
 */

import type { PlanningConflictItem } from '../../trip-constraint-solver/types/planning-conflicts.types';
import type {
  TripConstraint,
  TripConstraintCategory,
} from '../../trip-constraint-solver/types/trip-constraint.types';
import type {
  AffectedScope,
  ConstraintAssertion,
  ConstraintDomain,
  DecisionProblem,
  DecisionProblemDetectedBy,
} from '../types/decision-semantics.types';
import {
  inferEnforcement,
  isOverridable,
} from './constraint-semantic.normalizer';
import { domainFromAssertion, resolveDecisionAuthority } from '../authority/decision-authority.matrix';

export function mapTripConstraintCategoryToDomain(category: TripConstraintCategory): ConstraintDomain {
  switch (category) {
    case 'TIME':
      return 'TIME';
    case 'BUDGET':
      return 'BUDGET';
    case 'SAFETY':
      return 'SAFETY';
    case 'TRANSPORT':
      return 'ROUTE';
    case 'ACCOMMODATION':
      return 'BOOKING';
    case 'ACTIVITY':
      return 'ACCESS';
    case 'MEMBER':
      return 'TEAM_FIT';
    case 'WORLD_STATE':
      return 'WEATHER';
    case 'DESTINATION':
      return 'ACCESS';
    default:
      return 'ROUTE';
  }
}

function inferNatureFromTripConstraint(c: TripConstraint): ConstraintAssertion['nature'] {
  if (c.source.type === 'WORLD_DATA' || c.source.type === 'OFFICIAL_RULE') {
    return c.type === 'EXTERNAL' ? 'HARD_CONSTRAINT' : 'RISK_PREDICTION';
  }
  if (c.type === 'HARD') return 'HARD_CONSTRAINT';
  if (c.type === 'SOFT') return 'SOFT_CONSTRAINT';
  return 'RISK_PREDICTION';
}

function pseudoPriority(c: TripConstraint): 'must_handle' | 'suggest_adjust' | 'pending_confirm' {
  if (c.status === 'CONFLICTED' || c.status === 'UNSATISFIED') {
    return c.type === 'HARD' ? 'must_handle' : 'suggest_adjust';
  }
  return c.type === 'HARD' ? 'must_handle' : 'pending_confirm';
}

function buildAffectedScope(c: TripConstraint, conflict?: PlanningConflictItem): AffectedScope[] {
  const severity =
    c.type === 'HARD' || c.status === 'CONFLICTED' ? ('HIGH' as const) : ('MEDIUM' as const);
  const scopeType =
    c.scope.type === 'DAY'
      ? ('DAY' as const)
      : c.scope.type === 'ITEM'
        ? ('ITINERARY_ITEM' as const)
        : c.scope.type === 'ROUTE_SEGMENT'
          ? ('ROUTE_SEGMENT' as const)
          : ('TRIP' as const);

  const scopes: AffectedScope[] = [];
  const dayIds = conflict?.affectedDays?.map(String) ?? c.scope.ids ?? [];
  if (dayIds.length && scopeType === 'DAY') {
    for (const day of dayIds) {
      scopes.push({
        scopeType: 'DAY',
        scopeId: day,
        impactType: c.type === 'HARD' ? 'BLOCKED' : 'PREFERENCE_UNSATISFIED',
        severity,
        explanation: conflict?.message ?? c.description,
      });
    }
  } else {
    scopes.push({
      scopeType,
      scopeId: c.scope.ids?.[0] ?? c.tripId,
      impactType: c.type === 'HARD' ? 'BLOCKED' : 'PREFERENCE_UNSATISFIED',
      severity,
      explanation: conflict?.message ?? c.description,
    });
  }
  return scopes;
}

export function buildAssertionFromTripConstraint(
  c: TripConstraint,
  conflict?: PlanningConflictItem,
): ConstraintAssertion {
  const nature = inferNatureFromTripConstraint(c);
  const priority = pseudoPriority(c);
  const enforcement = inferEnforcement(nature, priority);
  const domain = mapTripConstraintCategoryToDomain(c.category);
  const conclusion = conflict?.message ?? c.description ?? `${c.name} 与当前方案冲突`;

  return {
    id: `ca_tc_${c.id}`,
    sourceSystem: 'TRIP_CONSTRAINT',
    sourceRefId: c.id,
    nature,
    domain,
    enforcement,
    overridable: isOverridable(nature, enforcement, `constraint_${c.category.toLowerCase()}`),
    overridePolicy:
      c.allowRelaxation && c.type !== 'HARD'
        ? { allowedBy: ['TRIP_OWNER'], requiresReason: true }
        : undefined,
    condition: c.name,
    conclusion,
    proofs: c.evidenceIds?.length
      ? c.evidenceIds.map((evId, i) => ({
          id: `tc_ev_${c.id}_${i}`,
          evidenceSource: 'trip_constraint',
          evidenceType: 'constraint_evidence',
          entity: c.id,
          constraint: c.name,
          currentFact: conclusion,
          conclusion: c.status === 'CONFLICTED' ? '约束冲突' : '约束未满足',
        }))
      : [],
  };
}

export function tripConstraintSemanticKey(
  c: TripConstraint,
  conflict?: PlanningConflictItem,
): string {
  if (conflict?.semanticKey) {
    return `tc:${c.id}:${conflict.semanticKey}`;
  }
  return `tc:${c.id}`;
}

export function adaptTripConstraintToProblem(
  c: TripConstraint,
  tripId: string,
  tripVersion: string,
  detectedAt: string,
  conflict?: PlanningConflictItem,
): { problem: DecisionProblem; assertion: ConstraintAssertion } {
  const assertion = buildAssertionFromTripConstraint(c, conflict);
  const affectedScope = buildAffectedScope(c, conflict);
  const problemType =
    assertion.nature === 'RISK_PREDICTION'
      ? 'PREFERENCE_CONFLICT'
      : assertion.enforcement === 'BLOCK'
        ? 'INFEASIBILITY'
        : 'RESOURCE_CONFLICT';

  const semanticKey = tripConstraintSemanticKey(c, conflict);
  const problem: DecisionProblem = {
    id: `dp_${semanticKey.replace(/[^a-zA-Z0-9:_-]/g, '_')}`,
    tripId,
    type: problemType,
    title: conflict?.title ?? c.name,
    description: assertion.conclusion,
    detectedBy: 'TRIP_CONSTRAINT' satisfies DecisionProblemDetectedBy,
    detectedAt,
    tripVersion,
    affectedScope,
    status: c.status === 'CONFLICTED' || c.status === 'UNSATISFIED' ? 'OPEN' : 'ASSESSING',
    semanticKey,
    sourceRefs: [{ system: 'TRIP_CONSTRAINT', refId: c.id, correlationId: conflict?.id }],
    assertionIds: [assertion.id],
    authority: resolveDecisionAuthority({
      problemType,
      primaryDomain: domainFromAssertion(assertion),
      enforcement: assertion.enforcement,
      overridable: assertion.overridable,
    }),
  };

  return { problem, assertion };
}

/** Skip when feasibility/gate already covers the same constraint conflict. */
export function tripConstraintProblemDuplicatesExisting(
  tcDetail: Pick<DecisionProblem, 'semanticKey' | 'sourceRefs' | 'description'>,
  existing: Map<string, { sourceRefs: DecisionProblem['sourceRefs']; semanticKey?: string; description: string }>,
  feasibilityIssues: Array<{ message: string; semanticKey?: string }>,
): boolean {
  const constraintRef = tcDetail.sourceRefs.find((r) => r.system === 'TRIP_CONSTRAINT')?.refId;
  if (!constraintRef) return false;

  for (const item of existing.values()) {
    if (item.sourceRefs.some((r) => r.system === 'TRIP_CONSTRAINT' && r.refId === constraintRef)) {
      return true;
    }
    if (tcDetail.semanticKey && item.semanticKey === tcDetail.semanticKey) {
      return true;
    }
  }

  const needle = tcDetail.description.toLowerCase().slice(0, 40);
  return feasibilityIssues.some(
    (i) =>
      (i.semanticKey && tcDetail.semanticKey?.includes(i.semanticKey)) ||
      i.message.toLowerCase().includes(needle) ||
      needle.includes(i.message.toLowerCase().slice(0, 32)),
  );
}
