import { createHash } from 'crypto';
import type { OntologyConstraintEvaluation } from '../evaluators/ontology-constraint.types';
import type { TravelWorldFact } from './travel-world-fact.types';
import {
  CONSTRAINT_ASSESSMENT_SCHEMA_ID,
  mergeConstraintOutcomes,
  type ConstraintAssessment,
  type ConstraintAssessmentBasis,
  type ConstraintAssessmentOutcome,
} from './constraint-assessment.types';
import { withAffectedGates } from '../authority/resolve-gate-status-from-assessments.util';
import { ONTOLOGY_CONSTRAINT_EVALUATOR } from '../evaluators/ontology-constraint.evaluator';

const ONTOLOGY_EVALUATOR_VERSION = ONTOLOGY_CONSTRAINT_EVALUATOR.version;

function mapSeverityToOutcome(
  severity: string,
): ConstraintAssessmentOutcome {
  switch (severity) {
    case 'BLOCK':
      return 'BLOCK';
    case 'WARNING':
      return 'WARNING';
    case 'MISSING_EVIDENCE':
      return 'NEED_CONFIRM';
    default:
      return 'UNKNOWN';
  }
}

export function computeFactSetVersion(facts: TravelWorldFact[]): string {
  const ids = [...facts.map((f) => f.factId)].sort().join('|');
  return `fs_${createHash('sha256').update(ids).digest('hex').slice(0, 16)}`;
}

export function computeAssessmentId(input: {
  basis: ConstraintAssessmentBasis;
  outcome: ConstraintAssessmentOutcome;
  reasonCodes: string[];
  factRefs: string[];
}): string {
  const payload = JSON.stringify({
    b: input.basis,
    o: input.outcome,
    r: [...input.reasonCodes].sort(),
    f: [...input.factRefs].sort(),
  });
  return `ca_${createHash('sha256').update(payload).digest('hex').slice(0, 24)}`;
}

export function buildConstraintAssessment(input: {
  facts: TravelWorldFact[];
  evaluation: OntologyConstraintEvaluation;
  basis?: Partial<ConstraintAssessmentBasis>;
  contextId?: string;
  tripId?: string;
  evaluatedAt?: string;
}): ConstraintAssessment {
  const factSetVersion = computeFactSetVersion(input.facts);
  const basis: ConstraintAssessmentBasis = {
    contextId: input.basis?.contextId ?? input.contextId ?? 'ctx_unbound',
    contextRevision: input.basis?.contextRevision ?? 0,
    effectivePlanVersion: input.basis?.effectivePlanVersion ?? 'pv_unknown',
    factSetVersion: input.basis?.factSetVersion ?? factSetVersion,
    worldStateVersion: input.basis?.worldStateVersion ?? factSetVersion,
    ontologyVersion:
      input.basis?.ontologyVersion ?? `ontology-eval@${ONTOLOGY_EVALUATOR_VERSION}`,
    constraintVersion:
      input.basis?.constraintVersion ??
      `ontology-constraint@${ONTOLOGY_EVALUATOR_VERSION}`,
    destinationPackVersion: input.basis?.destinationPackVersion ?? 'is@p0',
  };
  const outcomes = input.evaluation.results.map((r) => mapSeverityToOutcome(r.severity));
  const outcome = mergeConstraintOutcomes(outcomes);
  const reasonCodes = input.evaluation.results.map((r) => r.code);
  const factRefs = input.facts.map((f) => f.factId);
  const subjectIds = [
    ...new Set(input.evaluation.results.flatMap((r) => r.affectedSubjectIds ?? [])),
  ];
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
  const assessmentId = computeAssessmentId({ basis, outcome, reasonCodes, factRefs });

  return withAffectedGates({
    schemaId: CONSTRAINT_ASSESSMENT_SCHEMA_ID,
    assessmentId,
    basis,
    outcome,
    reasonCodes,
    factRefs,
    constraintRefs: reasonCodes.map((c) => `constraint:${c}`),
    affectedScopes: [
      {
        tripId:
          input.tripId ?? input.facts.find((f) => f.scope.tripId)?.scope.tripId,
        subjectIds: subjectIds.length > 0 ? subjectIds : undefined,
        country: 'IS',
      },
    ],
    evaluatedAt,
    lifecycleStatus: 'ACTIVE',
  });
}

export function invalidateAssessment(
  assessment: ConstraintAssessment,
  input: { actionId: string; supersededByAssessmentId: string },
): ConstraintAssessment {
  return {
    ...assessment,
    invalidated: true,
    invalidatedByActionId: input.actionId,
    supersededByAssessmentId: input.supersededByAssessmentId,
  };
}
