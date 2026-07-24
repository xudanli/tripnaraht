/**
 * Project planning-conflicts + decision-problem assertions → DestinationInsight[].
 */

import type { FeasibilityProofDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import type { PlanningConflictItem } from '../../trip-constraint-solver/types/planning-conflicts.types';
import type {
  ConstraintAssertion,
  DecisionProblemDetail,
  EvidenceReference,
} from '../types/decision-semantics.types';
import type {
  DestinationInsight,
  DestinationInsightEvidenceRef,
  DestinationInsightSourceLevel,
  DestinationInsightType,
} from '../types/destination-insight.types';
import { planBActionLabelZh } from '../../../poi-access-capacity/utils/plan-b-action-label.util';

function insightId(prefix: string, key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 120);
  return `di_${prefix}_${safe}`;
}

function sourceLevelFromProof(proof: FeasibilityProofDto): DestinationInsightSourceLevel {
  const t = (proof.evidenceType ?? '').toLowerCase();
  if (t.includes('road') || t === 'road_closure') return 'L1';
  if (t.includes('weather') && proof.evidenceSource?.includes('live')) return 'L1';
  if (t === 'poi_access_capacity') return 'L2';
  return 'L2';
}

function insightTypeFromConflict(category: string, issueKind?: string): DestinationInsightType {
  if (category === 'access_capacity' || issueKind === 'poi_access_risk') return 'ACTIVITY_GUIDANCE';
  if (category === 'environment') return 'EXPLANATION';
  if (category === 'schedule' || category === 'transport') return 'RISK';
  return 'EXPLANATION';
}

function proofToSourceRef(proof: FeasibilityProofDto): DestinationInsightEvidenceRef {
  const t = (proof.evidenceType ?? '').toLowerCase();
  const system =
    t === 'poi_access_capacity'
      ? 'POI_ACCESS'
      : t.includes('road')
        ? 'ROAD_IS'
        : proof.evidenceSource === 'OFFICIAL'
          ? 'OFFICIAL'
          : 'FEASIBILITY';
  return {
    system,
    refId: proof.entity ?? proof.itemId ?? proof.placeLabel ?? 'proof',
    label: proof.placeLabel ?? proof.entity,
    confidence: proof.confidence,
  };
}

function assertionProofToSourceRef(proof: EvidenceReference): DestinationInsightEvidenceRef {
  const t = (proof.evidenceType ?? '').toLowerCase();
  return {
    system:
      t === 'poi_access_capacity'
        ? 'POI_ACCESS'
        : proof.evidenceSource === 'OFFICIAL'
          ? 'OFFICIAL'
          : 'FEASIBILITY',
    refId: proof.entity ?? proof.id ?? 'assertion-proof',
    label: proof.entity,
    confidence: proof.confidence,
  };
}

export function conflictRefIdFromProblemId(problemId: string): string | undefined {
  if (problemId.startsWith('dp_id:')) return problemId.slice('dp_id:'.length);
  if (problemId.startsWith('dp_')) return problemId.slice(3);
  return problemId;
}

export function insightsFromPlanningConflict(conflict: PlanningConflictItem): DestinationInsight[] {
  const issue = conflict.issue;
  const insights: DestinationInsight[] = [];
  const baseType = insightTypeFromConflict(conflict.category, issue?.issueKind);
  const relatedIds = [conflict.id, conflict.semanticKey].filter(Boolean) as string[];

  if (conflict.title || conflict.message) {
    insights.push({
      id: insightId('conflict', conflict.id),
      type: baseType,
      title: conflict.title,
      summary: conflict.message,
      applicability: {
        poiSlugs: issue?.visitorAccess?.evaluation?.poiId
          ? [issue.visitorAccess.evaluation.poiId]
          : undefined,
      },
      sourceLevel: 'L2',
      sourceRefs: [{ system: 'FEASIBILITY', refId: conflict.id, label: conflict.title }],
      relatedTripObjectIds: relatedIds,
      explanatoryOnly: conflict.priority !== 'must_handle',
    });
  }

  for (const [i, proof] of (issue?.proofs ?? []).entries()) {
    insights.push({
      id: insightId('proof', `${conflict.id}_${i}`),
      type: baseType,
      title: proof.placeLabel ?? proof.entity ?? conflict.title,
      summary: proof.currentFact ?? proof.conclusion ?? conflict.message,
      applicability: {
        poiSlugs: proof.entity?.startsWith('is.') ? [proof.entity] : undefined,
      },
      sourceLevel: sourceLevelFromProof(proof),
      sourceRefs: [proofToSourceRef(proof)],
      relatedTripObjectIds: relatedIds,
      verifiedAt: proof.observedAt,
      explanatoryOnly: proof.conclusion !== 'BLOCKED' && proof.conclusion !== 'INFEASIBLE',
    });
  }

  const hints = issue?.visitorAccess?.evaluation?.planBHints ?? [];
  for (const [i, hint] of hints.entries()) {
    insights.push({
      id: insightId('planb', `${conflict.id}_${i}`),
      type: 'ALTERNATIVE',
      title: planBActionLabelZh(hint.action),
      summary: hint.detail,
      applicability: {
        poiSlugs: issue?.visitorAccess?.evaluation?.poiId
          ? [issue.visitorAccess.evaluation.poiId]
          : undefined,
      },
      sourceLevel: 'L2',
      sourceRefs: [
        {
          system: 'POI_ACCESS',
          refId: issue?.visitorAccess?.evaluation?.poiId ?? conflict.id,
          label: 'planBHint',
        },
      ],
      relatedTripObjectIds: relatedIds,
      explanatoryOnly: true,
    });
  }

  return dedupeInsights(insights);
}

export function insightsFromDecisionProblem(detail: DecisionProblemDetail): DestinationInsight[] {
  const insights: DestinationInsight[] = [];
  const problemRef = [detail.id, detail.semanticKey].filter(Boolean) as string[];

  for (const assertion of detail.assertions ?? []) {
    insights.push({
      id: insightId('assertion', assertion.id),
      type: mapAssertionDomain(assertion.domain),
      title: detail.title,
      summary: assertion.conclusion || assertion.condition,
      applicability: {},
      sourceLevel: assertion.sourceSystem === 'GATE' ? 'L4' : 'L2',
      sourceRefs: [
        {
          system: assertion.sourceSystem === 'FEASIBILITY' ? 'FEASIBILITY' : 'OFFICIAL',
          refId: assertion.sourceRefId,
          label: assertion.domain,
        },
      ],
      relatedProblemIds: problemRef,
      explanatoryOnly: assertion.enforcement === 'WARN' || assertion.enforcement === 'INFORM',
    });

    for (const [i, proof] of (assertion.proofs ?? []).entries()) {
      insights.push({
        id: insightId('ap', `${assertion.id}_${i}`),
        type: mapAssertionDomain(assertion.domain),
        title: proof.entity ?? detail.title,
        summary: proof.currentFact ?? proof.conclusion ?? assertion.conclusion,
        applicability: {
          poiSlugs: proof.entity?.startsWith('is.') ? [proof.entity] : undefined,
        },
        sourceLevel: assertionProofToSourceRef(proof).system === 'POI_ACCESS' ? 'L2' : 'L2',
        sourceRefs: [assertionProofToSourceRef(proof)],
        relatedProblemIds: problemRef,
        explanatoryOnly: true,
      });
    }
  }

  return dedupeInsights(insights);
}

function mapAssertionDomain(domain: ConstraintAssertion['domain']): DestinationInsightType {
  if (domain === 'ACCESS') return 'ACTIVITY_GUIDANCE';
  if (domain === 'WEATHER' || domain === 'ROUTE' || domain === 'SAFETY') return 'RISK';
  return 'EXPLANATION';
}

export function filterConflictsForFocus(
  conflicts: PlanningConflictItem[],
  focus: {
    focusConflictId?: string;
    problemId?: string;
    placeId?: number;
    poiSlug?: string;
    dayIndex?: number;
  },
): PlanningConflictItem[] {
  if (focus.focusConflictId) {
    return conflicts.filter(
      (c) =>
        c.id === focus.focusConflictId ||
        c.semanticKey === focus.focusConflictId ||
        c.issue?.id === focus.focusConflictId,
    );
  }
  if (focus.problemId) {
    const ref = conflictRefIdFromProblemId(focus.problemId);
    return conflicts.filter(
      (c) =>
        c.id === ref ||
        c.semanticKey === ref ||
        c.issue?.id === ref ||
        (ref && c.id.includes(ref)),
    );
  }
  if (focus.poiSlug) {
    return conflicts.filter((c) => {
      const slug = c.issue?.visitorAccess?.evaluation?.poiId;
      if (slug === focus.poiSlug) return true;
      return (c.issue?.proofs ?? []).some((p) => p.entity === focus.poiSlug);
    });
  }
  if (focus.placeId != null) {
    return conflicts.filter((c) =>
      (c.issue?.proofs ?? []).some((p) => p.itemId && String(p.itemId).includes(String(focus.placeId))),
    );
  }
  if (focus.dayIndex != null) {
    return conflicts.filter((c) => c.affectedDays?.includes(focus.dayIndex!));
  }
  return conflicts;
}

export function dedupeInsights(insights: DestinationInsight[]): DestinationInsight[] {
  const seen = new Set<string>();
  const out: DestinationInsight[] = [];
  for (const ins of insights) {
    const key = `${ins.type}:${ins.title}:${ins.summary.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ins);
  }
  return out;
}

export function insightsFromRagChunks(
  chunks: Array<{
    chunkId: string;
    content: string;
    category?: string;
    credibilityScore?: number;
    metadata?: Record<string, unknown>;
  }>,
): DestinationInsight[] {
  return chunks.map((c) => {
    const cat = (c.category ?? '').toUpperCase();
    const roadId = typeof c.metadata?.roadId === 'string' ? c.metadata.roadId : undefined;
    const isStress = cat === 'ROAD_STATUS' || cat === 'RISK_INFO' || cat === 'GATE';
    return {
      id: insightId('rag', c.chunkId),
      type: isStress ? 'RULE' : 'EXPLANATION',
      title: c.chunkId,
      summary: c.content.slice(0, 500),
      applicability: { roadIds: roadId ? [roadId] : undefined },
      sourceLevel: isStress ? 'L3' : 'L5',
      sourceRefs: [{ system: 'RAG', refId: c.chunkId, confidence: c.credibilityScore }],
      explanatoryOnly: !isStress,
    };
  });
}
