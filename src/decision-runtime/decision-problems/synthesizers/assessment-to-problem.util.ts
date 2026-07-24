/**
 * ConstraintAssessment → DecisionProblemDetail (Phase 3 synthesizer).
 */

import type { ConstraintEvaluationStatus } from '../../constraints/contracts/constraint-assertion';
import type { ConstraintAssessment } from '../../constraints/contracts/constraint-assessment.types';
import { ENFORCEMENT_ALLOWED_ACTIONS } from '../../gateway/utils/decision-queue-admission.util';
import { domainFromAssertion, resolveDecisionAuthority } from '../../../trips/decision-semantics/authority/decision-authority.matrix';
import type {
  ConstraintAssertion,
  ConstraintDomain,
  ConstraintEnforcement,
  ConstraintNature,
  ConstraintSourceSystem,
  DecisionProblemDetail,
  DecisionProblemDetectedBy,
  DecisionProblemType,
  DecisionOptionType,
} from '../../../trips/decision-semantics/types/decision-semantics.types';

export interface DecisionProblemActionability {
  enforcement: ConstraintEnforcement;
  allowedActions: DecisionOptionType[];
  requiresAction: boolean;
}

export function assessmentStatusToEnforcement(status: ConstraintEvaluationStatus): ConstraintEnforcement {
  switch (status) {
    case 'BLOCK':
      return 'BLOCK';
    case 'REQUIRES_VERIFICATION':
    case 'UNKNOWN':
      return 'REQUIRE_CONFIRMATION';
    case 'WARNING':
      return 'WARN';
    default:
      return 'INFORM';
  }
}

export function resolveActionabilityFromAssessment(
  assessment: ConstraintAssessment,
): DecisionProblemActionability {
  const enforcement = assessmentStatusToEnforcement(assessment.status);
  const allowedActions = ENFORCEMENT_ALLOWED_ACTIONS[enforcement];
  return {
    enforcement,
    allowedActions,
    requiresAction: enforcement !== 'INFORM',
  };
}

function mapSourceSystem(system: ConstraintAssessment['sourceRef']['system']): ConstraintSourceSystem {
  switch (system) {
    case 'GATEWAY':
    case 'GUARDIAN':
      return 'FEASIBILITY';
    case 'GATE':
      return 'GATE';
    case 'TRIP_CONSTRAINT':
      return 'TRIP_CONSTRAINT';
    default:
      return 'FEASIBILITY';
  }
}

function mapDetectedBy(system: ConstraintAssessment['sourceRef']['system']): DecisionProblemDetectedBy {
  switch (system) {
    case 'GUARDIAN':
    case 'GATEWAY':
      return 'GUARDIAN';
    case 'GATE':
      return 'GATE';
    case 'TRIP_CONSTRAINT':
      return 'TRIP_CONSTRAINT';
    default:
      return 'FEASIBILITY';
  }
}

function inferProblemTypeFromAssessment(assessment: ConstraintAssessment): DecisionProblemType {
  const enforcement = assessmentStatusToEnforcement(assessment.status);
  if (enforcement === 'BLOCK') return 'INFEASIBILITY';
  if (/risk|weather|wind/i.test(assessment.semanticKey)) return 'RISK';
  if (assessment.semanticKey.includes('budget')) return 'RESOURCE_CONFLICT';
  return enforcement === 'WARN' ? 'RISK' : 'INFEASIBILITY';
}

function inferDomain(semanticKey: string): ConstraintDomain {
  const k = semanticKey.toLowerCase();
  if (k.includes('road') || k.includes('drive') || k.includes('load')) return 'ROUTE';
  if (k.includes('weather') || k.includes('wind')) return 'WEATHER';
  if (k.includes('poi_access') || k.includes('access')) return 'ACCESS';
  if (k.includes('buffer') || k.includes('schedule')) return 'TIME';
  if (k.includes('budget')) return 'BUDGET';
  return 'SAFETY';
}

function buildAssertionFromAssessment(assessment: ConstraintAssessment): ConstraintAssertion {
  const actionability = resolveActionabilityFromAssessment(assessment);
  const nature: ConstraintNature =
    actionability.enforcement === 'BLOCK' ? 'HARD_CONSTRAINT' : 'SOFT_CONSTRAINT';

  return {
    id: assessment.semanticsAssertionId ?? `ca_${assessment.assessmentId}`,
    sourceSystem: mapSourceSystem(assessment.sourceRef.system),
    sourceRefId: assessment.sourceRef.refId,
    nature,
    domain: inferDomain(assessment.semanticKey),
    enforcement: actionability.enforcement,
    overridable: assessment.overridable ?? actionability.enforcement !== 'BLOCK',
    condition: assessment.explanationCode,
    conclusion: assessment.message,
    proofs: assessment.evidenceRefs.map((ref) => ({
      evidenceSource: ref,
      ruleId: assessment.ruleRefs?.[0],
      confidence: assessment.confidence,
    })),
  };
}

function stableProblemIdFromAssessment(assessment: ConstraintAssessment): string {
  const key = assessment.semanticKey;
  return key.startsWith('dp_') ? key : `dp_${key.replace(/^issue-/, '')}`;
}

function inferProblemStatus(
  assessment: ConstraintAssessment,
): import('../../../trips/decision-semantics/types/decision-semantics.types').DecisionProblemStatus {
  const enforcement = assessmentStatusToEnforcement(assessment.status);
  if (enforcement === 'REQUIRE_CONFIRMATION') return 'WAITING_DECISION';
  if (enforcement === 'BLOCK' || enforcement === 'REQUIRE_ADJUSTMENT') return 'OPEN';
  return 'ASSESSING';
}

function buildAffectedScopes(assessment: ConstraintAssessment) {
  const scopes: import('../../../trips/decision-semantics/types/decision-semantics.types').AffectedScope[] =
    [];
  const dayNumbers = (assessment.affectedScope.dayIds ?? [])
    .map((d) => {
      const m = /day-(\d+)/.exec(d);
      return m ? Number(m[1]) : undefined;
    })
    .filter((n): n is number => n != null);

  for (const day of dayNumbers) {
    scopes.push({
      scopeType: 'DAY',
      scopeId: `day-${day}`,
      impactType: 'BLOCKED',
      severity: assessment.status === 'BLOCK' ? 'CRITICAL' : 'MEDIUM',
      explanation: assessment.message,
    });
  }

  if (!scopes.length) {
    scopes.push({
      scopeType: 'TRIP',
      scopeId: assessment.affectedScope.tripId,
      impactType: 'BLOCKED',
      severity: assessment.status === 'BLOCK' ? 'HIGH' : 'MEDIUM',
      explanation: assessment.message,
    });
  }

  return scopes;
}

export function synthesizeProblemFromAssessment(
  assessment: ConstraintAssessment,
  input: { tripId: string; tripVersion: string; detectedAt: string },
): DecisionProblemDetail {
  const assertion = buildAssertionFromAssessment(assessment);
  const problemType = inferProblemTypeFromAssessment(assessment);
  const primaryDomain = domainFromAssertion(assertion);
  const authority = resolveDecisionAuthority({
    problemType,
    primaryDomain,
    enforcement: assertion.enforcement,
    overridable: assertion.overridable,
    issueKind: assessment.explanationCode,
  });

  const title = assessment.message.split('：')[0]?.slice(0, 80) || assessment.semanticKey;

  return {
    id: stableProblemIdFromAssessment(assessment),
    tripId: input.tripId,
    type: problemType,
    title,
    description: assessment.message,
    detectedBy: mapDetectedBy(assessment.sourceRef.system),
    detectedAt: input.detectedAt,
    tripVersion: input.tripVersion,
    affectedScope: buildAffectedScopes(assessment),
    status: inferProblemStatus(assessment),
    semanticKey: assessment.semanticKey,
    sourceRefs: [{ system: mapDetectedBy(assessment.sourceRef.system), refId: assessment.sourceRef.refId }],
    assertionIds: [assertion.id],
    authority,
    assertions: [assertion],
  };
}

export function problemDedupeKeyFromDetail(detail: DecisionProblemDetail): string {
  return detail.semanticKey ?? detail.id;
}
