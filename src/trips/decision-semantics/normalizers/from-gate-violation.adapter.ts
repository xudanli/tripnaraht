/**
 * Gate / DSO constraint violations → DecisionProblem + ConstraintAssertion
 */

import type { ConstraintViolationItem } from '../../../decision/kernel/decision-state.types';
import type {
  ConstraintAssertion,
  DecisionProblem,
  DecisionProblemDetectedBy,
  DecisionSourceRef,
  EvidenceReference,
} from '../types/decision-semantics.types';
import {
  inferEnforcement,
  isOverridable,
} from './constraint-semantic.normalizer';
import { domainFromAssertion, resolveDecisionAuthority } from '../authority/decision-authority.matrix';
import { propagateAffectedScopes } from '../propagation/impact-propagation.service';
import type { FeasibilityIssueDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';

export interface GateViolationLike {
  type: string;
  severity: 'HARD' | 'SOFT';
  detail: string;
  constraint?: string;
  degree?: number;
  evidence_refs?: string[];
}

function mapGateTypeToDomain(type: string): ConstraintAssertion['domain'] {
  const t = type.toUpperCase();
  if (t.includes('SAFETY') || t === 'DEM') return 'SAFETY';
  if (t.includes('REACH')) return 'ROUTE';
  if (t.includes('TIME') || t.includes('FATIGUE')) return 'TIME';
  if (t.includes('BUDGET')) return 'BUDGET';
  if (t.includes('DATA')) return 'ACCESS';
  return 'ROUTE';
}

function inferNatureFromGateViolation(v: GateViolationLike): ConstraintAssertion['nature'] {
  if (v.severity === 'HARD') return 'HARD_CONSTRAINT';
  if (v.type.toUpperCase().includes('RISK') || v.type.toUpperCase() === 'DEM') return 'RISK_PREDICTION';
  return 'SOFT_CONSTRAINT';
}

function pseudoIssueFromGate(v: GateViolationLike, index: number): FeasibilityIssueDto {
  return {
    id: `gate-violation-${index}-${v.constraint ?? v.type}`,
    priority: v.severity === 'HARD' ? 'must_handle' : 'suggest_adjust',
    category: mapGateTypeToDomain(v.type).toLowerCase(),
    title: v.detail.slice(0, 80),
    message: v.detail,
    affectedDays: [],
    severity: v.severity === 'HARD' ? 'high' : 'medium',
    issueKind: `gate_${v.type.toLowerCase()}`,
    proofs: v.evidence_refs?.length
      ? [
          {
            entity: v.constraint ?? v.type,
            constraint: v.constraint ?? v.type,
            currentFact: v.detail,
            evidenceSource: 'gate_eval',
            evidenceType: 'gate_violation',
            conclusion: v.severity === 'HARD' ? '硬门控违反' : '软门控警告',
            confidence: typeof v.degree === 'number' ? 1 - v.degree : 0.85,
          },
        ]
      : undefined,
  };
}

export function buildAssertionFromGateViolation(
  v: GateViolationLike,
  index: number,
): ConstraintAssertion {
  const pseudo = pseudoIssueFromGate(v, index);
  const nature = inferNatureFromGateViolation(v);
  const enforcement = inferEnforcement(nature, pseudo.priority);
  const domain = mapGateTypeToDomain(v.type);
  const proofs: EvidenceReference[] = (pseudo.proofs ?? []).map((p, i) => ({
    id: `gate_ev_${index}_${i}`,
    entity: p.entity,
    constraint: p.constraint,
    currentFact: p.currentFact,
    evidenceSource: p.evidenceSource,
    evidenceType: p.evidenceType,
    confidence: p.confidence,
    conclusion: p.conclusion,
  }));

  return {
    id: `ca_gate_${index}_${v.constraint ?? v.type}`,
    sourceSystem: 'GATE',
    sourceRefId: `${v.type}:${v.constraint ?? 'default'}`,
    nature,
    domain,
    enforcement,
    overridable: isOverridable(nature, enforcement, pseudo.issueKind),
    overridePolicy: isOverridable(nature, enforcement, pseudo.issueKind)
      ? { allowedBy: ['TRIP_OWNER'], requiresReason: true }
      : undefined,
    condition: v.constraint ?? v.type,
    conclusion: v.detail,
    proofs,
  };
}

export function adaptGateViolationToProblem(
  v: GateViolationLike,
  index: number,
  tripId: string,
  tripVersion: string,
  detectedAt: string,
): { problem: DecisionProblem; assertion: ConstraintAssertion; pseudoIssue: FeasibilityIssueDto } {
  const pseudo = pseudoIssueFromGate(v, index);
  const assertion = buildAssertionFromGateViolation(v, index);
  const affectedScope = propagateAffectedScopes(pseudo, assertion);
  const problemType =
    assertion.nature === 'RISK_PREDICTION'
      ? 'RISK'
      : assertion.enforcement === 'BLOCK'
        ? 'INFEASIBILITY'
        : 'RISK';

  const semanticKey = `gate:${v.type}:${v.constraint ?? v.detail.slice(0, 40)}`;
  const problem: DecisionProblem = {
    id: `dp_${semanticKey.replace(/[^a-zA-Z0-9:_-]/g, '_')}`,
    tripId,
    type: problemType,
    title: pseudo.title,
    description: v.detail,
    detectedBy: 'GATE' satisfies DecisionProblemDetectedBy,
    detectedAt,
    tripVersion,
    affectedScope,
    status: assertion.enforcement === 'BLOCK' ? 'OPEN' : 'ASSESSING',
    semanticKey,
    sourceRefs: [{ system: 'GATE', refId: assertion.sourceRefId }],
    assertionIds: [assertion.id],
    authority: resolveDecisionAuthority({
      problemType,
      primaryDomain: domainFromAssertion(assertion),
      enforcement: assertion.enforcement,
      overridable: assertion.overridable,
      issueKind: pseudo.issueKind,
    }),
  };

  return { problem, assertion, pseudoIssue: pseudo };
}

export function constraintViolationItemsToGateLike(
  items: ConstraintViolationItem[],
): GateViolationLike[] {
  return items.map((v) => ({
    type: v.type,
    severity: v.severity,
    detail: v.detail,
    constraint: v.constraint,
    degree: v.degree,
  }));
}

export function mergeSourceRefs(
  a: DecisionSourceRef[],
  b: DecisionSourceRef[],
): DecisionSourceRef[] {
  const seen = new Set<string>();
  const out: DecisionSourceRef[] = [];
  for (const ref of [...a, ...b]) {
    const key = `${ref.system}:${ref.refId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

export function problemDedupeKey(problem: Pick<DecisionProblem, 'semanticKey' | 'id'>): string {
  return problem.semanticKey ?? problem.id;
}

/** Skip gate problem when feasibility already covers same constraint/message. */
export function gateProblemDuplicatesFeasibility(
  gateDetail: string,
  gateConstraint: string | undefined,
  feasibilityIssues: FeasibilityIssueDto[],
): boolean {
  const needle = gateDetail.toLowerCase().slice(0, 48);
  return feasibilityIssues.some((i) => {
    if (gateConstraint && i.issueKind?.includes(gateConstraint.toLowerCase())) return true;
    return i.message.toLowerCase().includes(needle) || needle.includes(i.message.toLowerCase().slice(0, 32));
  });
}
