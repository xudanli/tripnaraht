import { attachRiskId } from '../adapters/environment-event-risk.adapter';
import type {
  ActiveRisk,
  RiskSourceProjection,
  TripExecutionRiskUserStateRecord,
} from '../types/execution-risk.types';
import { deriveRiskId } from './risk-key.util';

export function mergeRiskProjections(projections: RiskSourceProjection[]): ActiveRisk[] {
  const byKey = new Map<string, RiskSourceProjection[]>();
  for (const p of projections) {
    const list = byKey.get(p.riskKey) ?? [];
    list.push(p);
    byKey.set(p.riskKey, list);
  }

  const merged: ActiveRisk[] = [];
  for (const group of byKey.values()) {
    merged.push(mergeProjectionGroup(group));
  }
  return merged.sort(compareRisks);
}

export function overlayUserState(
  risk: ActiveRisk,
  state?: TripExecutionRiskUserStateRecord,
  now = Date.now(),
): ActiveRisk {
  if (!state) {
    return {
      ...risk,
      acknowledgementStatus: 'UNSEEN',
    };
  }

  let acknowledgementStatus = risk.acknowledgementStatus;
  if (state.snoozedUntil && Date.parse(state.snoozedUntil) > now) {
    acknowledgementStatus = 'SNOOZED';
  } else if (state.acknowledgedAt) {
    acknowledgementStatus = 'ACKNOWLEDGED';
  } else if (state.lastViewedAt) {
    acknowledgementStatus = 'SEEN';
  }

  return {
    ...risk,
    acknowledgementStatus,
  };
}

function mergeProjectionGroup(group: RiskSourceProjection[]): ActiveRisk {
  const sorted = [...group].sort((a, b) => (b.sourcePriority ?? 0) - (a.sourcePriority ?? 0));
  const primary = sorted[0]!;
  const withId = attachRiskId(primary);

  const sourceRefs = dedupeSourceRefs(sorted.flatMap((p) => p.sourceRefs));
  const evidenceRefs = dedupeEvidence(sorted.flatMap((p) => p.evidenceRefs));
  const recommendationIds = [...new Set(sorted.flatMap((p) => p.recommendationIds))];
  const decisionProblemIds = [...new Set(sorted.flatMap((p) => p.decisionProblemIds))];
  const interventionIds = [...new Set(sorted.flatMap((p) => p.interventionIds))];

  const level = maxLevel(sorted.map((p) => p.level));
  const executionGate = maxGate(sorted.map((p) => p.executionGate ?? 'ALLOW'));
  const knowledgePrimary = pickKnowledgePrimary(sorted);

  return {
    ...withId,
    level,
    executionGate,
    sourceRefs,
    evidenceRefs,
    recommendationIds,
    decisionProblemIds,
    interventionIds,
    acknowledgementStatus: 'UNSEEN',
    treatmentStatus: deriveTreatmentStatus({
      decisionProblemIds,
      recommendationIds,
      level,
      severityState: knowledgePrimary.severityState,
    }),
    updatedAt: sorted.map((p) => p.updatedAt).sort().reverse()[0] ?? primary.updatedAt,
    knowledgeCode: knowledgePrimary.knowledgeCode,
    matchedRuleId: knowledgePrimary.matchedRuleId,
    isRootCause: knowledgePrimary.isRootCause,
    generationMode: knowledgePrimary.generationMode,
    observedMetrics: knowledgePrimary.observedMetrics,
    metricValue: knowledgePrimary.metricValue,
    metricUnit: knowledgePrimary.metricUnit,
    rootEventId: knowledgePrimary.rootEventId,
    causalParentId: pickCausalParent(sorted),
    severityState: knowledgePrimary.severityState,
    dataGaps: knowledgePrimary.dataGaps,
    hysteresis: knowledgePrimary.hysteresis,
  };
}

function pickCausalParent(group: RiskSourceProjection[]): string | undefined {
  return group.find((p) => p.causalParentId)?.causalParentId;
}

function pickKnowledgePrimary(group: RiskSourceProjection[]): RiskSourceProjection {
  const withRule = group.find((p) => p.matchedRuleId);
  if (withRule) return withRule;
  return group[0]!;
}

function deriveTreatmentStatus(input: {
  decisionProblemIds: string[];
  recommendationIds: string[];
  level: ActiveRisk['level'];
  severityState?: ActiveRisk['severityState'];
}): ActiveRisk['treatmentStatus'] {
  if (input.severityState === 'UNKNOWN') return 'ACTION_REQUIRED';
  if (input.decisionProblemIds.length > 0) return 'DECISION_REQUIRED';
  if (input.recommendationIds.length > 0 && input.level !== 'LOW') return 'ACTION_REQUIRED';
  return 'NO_ACTION_REQUIRED';
}

function compareRisks(a: ActiveRisk, b: ActiveRisk): number {
  const levelOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  const dl = levelOrder[b.level] - levelOrder[a.level];
  if (dl !== 0) return dl;
  const aStart = a.impactStartAt ? Date.parse(a.impactStartAt) : Number.MAX_SAFE_INTEGER;
  const bStart = b.impactStartAt ? Date.parse(b.impactStartAt) : Number.MAX_SAFE_INTEGER;
  if (aStart !== bStart) return aStart - bStart;
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}

function dedupeSourceRefs(refs: ActiveRisk['sourceRefs']) {
  const seen = new Set<string>();
  return refs.filter((r) => {
    const k = `${r.sourceSystem}:${r.sourceId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function dedupeEvidence(refs: ActiveRisk['evidenceRefs']) {
  const seen = new Set<string>();
  return refs.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

function maxLevel(levels: ActiveRisk['level'][]): ActiveRisk['level'] {
  const order = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
  return levels.reduce((m, c) => (order[c] > order[m] ? c : m), 'LOW');
}

function maxGate(gates: NonNullable<ActiveRisk['executionGate']>[]): NonNullable<ActiveRisk['executionGate']> {
  const order = { ALLOW: 1, AT_RISK: 2, REPLAN_REQUIRED: 3, STOP: 4 };
  return gates.reduce((m, c) => (order[c] > order[m] ? c : m), 'ALLOW');
}

export function filterActiveRisks(risks: ActiveRisk[], now = Date.now()): ActiveRisk[] {
  return risks.filter((r) => {
    if (r.lifecycleStatus === 'RESOLVED' || r.lifecycleStatus === 'EXPIRED') return false;
    if (r.validUntil && Date.parse(r.validUntil) < now) return false;
    return r.lifecycleStatus === 'DETECTED' || r.lifecycleStatus === 'ACTIVE' || r.lifecycleStatus === 'ESCALATED' || r.lifecycleStatus === 'MITIGATED';
  });
}

export function resolveRiskById(risks: ActiveRisk[], riskId: string): ActiveRisk | undefined {
  return risks.find((r) => r.id === riskId);
}

export { deriveRiskId };
