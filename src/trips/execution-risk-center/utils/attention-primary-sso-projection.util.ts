/**
 * Slice 4 Phase C — apply Attention Primary SSO to ERC / Mobile projections.
 */

import type { ExecutionAlertDto } from '../../../mobile/dto/mobile-execution.types';
import type { ActiveRisk, ActiveRiskCode } from '../types/execution-risk.types';
import type { AttentionPrimarySsoCutoverPlan } from '../../guardian-decision-core/attention/attention-primary-sso-cutover.util';
import type {
  RootCauseCluster,
  UnifiedDecisionItemProjection,
} from '../../guardian-decision-core/contracts/attention-orchestration.types';
import { findLinkedRisksForDecisionProblem } from '../adapters/active-risk-intervention.adapter';
import {
  extractSemanticFromAnchorProblemId,
  normalizeSemanticForPrimarySsoDedup,
} from '../../guardian-decision-core/attention/attention-primary-sso-cutover.util';
import { buildAttentionPrimaryUserNarrative } from '../../guardian-decision-core/attention/attention-primary-user-narrative.util';
import { isDerivedImpactOf } from './execution-alerts-aggregation.util';

const WEATHER_CODES: ActiveRiskCode[] = [
  'WEATHER_STRONG_WIND',
  'WEATHER_HEAVY_RAIN',
  'WEATHER_SEVERE',
];

/** Backfill decision links from Attention clusters so ERC risks join Primary SSO suppression. */
export function backfillRiskLinksForPrimarySso(
  risks: ActiveRisk[],
  plan: AttentionPrimarySsoCutoverPlan,
): ActiveRisk[] {
  const problemToPrimary = new Map<string, string>();
  for (const cluster of plan.shadowClusters) {
    if (cluster.status !== 'OPEN') continue;
    for (const relatedId of cluster.relatedProblemIds) {
      problemToPrimary.set(relatedId, cluster.primaryProblemId);
    }
    for (const effect of plan.attentionPrimaryItems.find(
      (item) => item.primaryProblemId === cluster.primaryProblemId,
    )?.relatedEffects ?? []) {
      problemToPrimary.set(effect.problemId, cluster.primaryProblemId);
    }
  }

  return risks.map((risk) => {
    if ((risk.decisionProblemIds ?? []).length > 0) return risk;

    for (const problemId of plan.suppressedProblemIds) {
      if (riskMatchesSuppressedSemantic(risk, problemId, plan)) {
        return appendDecisionLink(risk, problemId);
      }
    }

    for (const [relatedId, primaryId] of problemToPrimary) {
      if (plan.suppressedProblemIds.has(relatedId) && riskMatchesClusterMember(risk, relatedId, plan)) {
        return appendDecisionLink(risk, relatedId, primaryId);
      }
    }

    return risk;
  });
}

export function resolveAnchorRiskForPrimarySso(
  risks: ActiveRisk[],
  plan: AttentionPrimarySsoCutoverPlan,
): ActiveRisk | undefined {
  for (const item of plan.attentionPrimaryItems) {
    const linked = findLinkedRisksForDecisionProblem(risks, item.primaryProblemId);
    if (linked.length > 0) {
      return [...linked].sort(
        (a, b) => gateWeight(b.executionGate) - gateWeight(a.executionGate),
      )[0];
    }
  }
  return undefined;
}

function appendDecisionLink(
  risk: ActiveRisk,
  problemId: string,
  clusterPrimaryId?: string,
): ActiveRisk {
  const decisionProblemIds = [...new Set([...(risk.decisionProblemIds ?? []), problemId])];
  const sourceRefs = [...risk.sourceRefs];
  if (!sourceRefs.some((r) => r.sourceSystem === 'DECISION_PROBLEM' && r.sourceId === problemId)) {
    sourceRefs.push({ sourceSystem: 'DECISION_PROBLEM', sourceId: problemId });
  }
  if (
    clusterPrimaryId &&
    !sourceRefs.some((r) => r.sourceSystem === 'DECISION_PROBLEM' && r.sourceId === clusterPrimaryId)
  ) {
    sourceRefs.push({ sourceSystem: 'DECISION_PROBLEM', sourceId: clusterPrimaryId });
  }
  return { ...risk, decisionProblemIds, sourceRefs };
}

function riskMatchesSuppressedSemantic(
  risk: ActiveRisk,
  problemId: string,
  plan: AttentionPrimarySsoCutoverPlan,
): boolean {
  for (const primary of plan.attentionPrimaryItems) {
    for (const effect of primary.relatedEffects) {
      if (effect.problemId !== problemId) continue;
      return riskMatchesSemanticCapability(risk, effect.semanticCapability);
    }
  }
  const embedded = extractSemanticFromAnchorProblemId(problemId);
  if (embedded) {
    return riskMatchesSemanticCapability(risk, embedded);
  }
  return false;
}

function riskMatchesClusterMember(
  risk: ActiveRisk,
  relatedProblemId: string,
  plan: AttentionPrimarySsoCutoverPlan,
): boolean {
  for (const primary of plan.attentionPrimaryItems) {
    const effect = primary.relatedEffects.find((e) => e.problemId === relatedProblemId);
    if (effect) return riskMatchesSemanticCapability(risk, effect.semanticCapability);
  }
  const cluster = plan.shadowClusters.find((c) => c.relatedProblemIds.includes(relatedProblemId));
  if (cluster) return riskMatchesClusterRootCause(risk, cluster);
  return false;
}

function riskMatchesSemanticCapability(risk: ActiveRisk, semantic: string): boolean {
  const norm = normalizeSemanticForPrimarySsoDedup(semantic);
  const text = `${risk.title} ${risk.summary}`;
  if (
    norm === 'WEATHER_STRONG_WIND' ||
    semantic === 'WEATHER_ACTIVITY_PROHIBITED' ||
    semantic === 'WEATHER_SEVERE'
  ) {
    if (/volcan|ash|火山/i.test(text)) return false;
    return (
      risk.type === 'ENVIRONMENT' &&
      WEATHER_CODES.includes(risk.code) &&
      (/强风|wind/i.test(text) ||
        risk.sourceRefs.some((r) => r.sourceSystem === 'ATTENTION_QUEUE'))
    );
  }
  if (norm === 'EXECUTION_SCHEDULE_INFEASIBLE' || semantic === 'EXECUTION_SLIP') {
    if (risk.type === 'SCHEDULE' || risk.code === 'SCHEDULE_DELAY') return true;
    return /执行偏差|偏紧|延误|infeasible|slip/i.test(`${risk.title} ${risk.summary}`);
  }
  return false;
}

function riskMatchesClusterRootCause(risk: ActiveRisk, cluster: RootCauseCluster): boolean {
  const root = cluster.rootCauseType;
  const text = `${risk.title} ${risk.summary}`;
  const hasAttentionLink = risk.sourceRefs.some((r) => r.sourceSystem === 'ATTENTION_QUEUE');

  if (root === 'WEATHER_STRONG_WIND' || root === 'WEATHER_SEVERE') {
    if (/volcan|ash|火山/i.test(text)) return false;
    return (
      risk.type === 'ENVIRONMENT' &&
      WEATHER_CODES.includes(risk.code) &&
      (hasAttentionLink || /强风|wind/i.test(text))
    );
  }
  if (root === 'ROAD_CLOSED') {
    return risk.type === 'ROAD_TRANSPORT' && risk.code === 'ROAD_CLOSED';
  }
  return false;
}

function gateWeight(gate: ActiveRisk['executionGate']): number {
  switch (gate) {
    case 'STOP':
      return 4;
    case 'REPLAN_REQUIRED':
      return 3;
    case 'AT_RISK':
      return 2;
    default:
      return 1;
  }
}

export function buildSuppressedRiskIdsForPrimarySso(
  risks: ActiveRisk[],
  plan: AttentionPrimarySsoCutoverPlan,
): Set<string> {
  const suppressed = new Set<string>();

  for (const problemId of plan.suppressedProblemIds) {
    for (const risk of findLinkedRisksForDecisionProblem(risks, problemId)) {
      const hasVisiblePrimary = (risk.decisionProblemIds ?? []).some((id) =>
        plan.visiblePrimaryProblemIds.has(id),
      );
      const hasVisibleSource = risk.sourceRefs.some(
        (ref) =>
          ref.sourceSystem === 'DECISION_PROBLEM' &&
          plan.visiblePrimaryProblemIds.has(ref.sourceId),
      );
      if (!hasVisiblePrimary && !hasVisibleSource) {
        suppressed.add(risk.id);
      }
    }
  }

  for (const risk of risks) {
    for (const ref of risk.sourceRefs) {
      if (ref.sourceSystem !== 'DECISION_PROBLEM') continue;
      if (plan.visiblePrimaryProblemIds.has(ref.sourceId)) continue;
      const embedded = extractSemanticFromAnchorProblemId(ref.sourceId);
      if (!embedded) continue;
      const norm = normalizeSemanticForPrimarySsoDedup(embedded);
      const matchesPrimary = plan.attentionPrimaryItems.some(
        (item) =>
          normalizeSemanticForPrimarySsoDedup(item.primarySemanticCapability) === norm,
      );
      if (matchesPrimary) {
        suppressed.add(risk.id);
      }
    }
  }

  const anchorRisk = resolveAnchorRiskForPrimarySso(risks, plan);
  if (anchorRisk) {
    for (const risk of risks) {
      if (risk.id === anchorRisk.id) continue;
      if (isDerivedImpactOf(risk, anchorRisk)) {
        suppressed.add(risk.id);
      }
    }
  }

  for (const cluster of plan.shadowClusters) {
    if (cluster.status !== 'OPEN') continue;
    if (!plan.visiblePrimaryProblemIds.has(cluster.primaryProblemId)) continue;
    for (const risk of risks) {
      if (plan.visiblePrimaryProblemIds.has(risk.decisionProblemIds?.[0] ?? '')) continue;
      if (riskMatchesClusterRootCause(risk, cluster)) {
        suppressed.add(risk.id);
      }
    }
    for (const primary of plan.attentionPrimaryItems) {
      if (primary.primaryProblemId !== cluster.primaryProblemId) continue;
      for (const effect of primary.relatedEffects) {
        for (const risk of risks) {
          if (riskMatchesSemanticCapability(risk, effect.semanticCapability)) {
            const visible = (risk.decisionProblemIds ?? []).some((id) =>
              plan.visiblePrimaryProblemIds.has(id),
            );
            if (!visible) suppressed.add(risk.id);
          }
        }
      }
    }
  }

  dedupeScheduleConflictRisks(risks, suppressed);

  return suppressed;
}

/** Keep strongest gate when multiple schedule conflict cards share the same scope. */
function dedupeScheduleConflictRisks(risks: ActiveRisk[], suppressed: Set<string>): void {
  const byFamily = new Map<string, ActiveRisk[]>();
  for (const risk of risks) {
    const key = scheduleConflictFamilyKey(risk);
    if (!key) continue;
    const list = byFamily.get(key) ?? [];
    list.push(risk);
    byFamily.set(key, list);
  }
  for (const family of byFamily.values()) {
    if (family.length < 2) continue;
    const sorted = [...family].sort(
      (a, b) => gateWeight(b.executionGate) - gateWeight(a.executionGate),
    );
    for (const duplicate of sorted.slice(1)) {
      suppressed.add(duplicate.id);
    }
  }
}

function scheduleConflictFamilyKey(risk: ActiveRisk): string | undefined {
  if (risk.code !== 'SCHEDULE_DELAY' && !/时间冲突|time.?conflict/i.test(risk.title)) {
    return undefined;
  }
  const scope =
    risk.affectedActivities[0]?.id ??
    risk.decisionProblemIds[0] ??
    risk.riskKey;
  return `time_conflict:${scope}`;
}

export function filterRisksForPrimarySso(
  risks: ActiveRisk[],
  plan: AttentionPrimarySsoCutoverPlan,
  suppressedRiskIds?: Set<string>,
): ActiveRisk[] {
  const linked = backfillRiskLinksForPrimarySso(risks, plan);
  const suppressed =
    suppressedRiskIds ?? buildSuppressedRiskIdsForPrimarySso(linked, plan);
  return linked.filter((risk) => {
    if (suppressed.has(risk.id)) return false;
    const problemIds = risk.decisionProblemIds ?? [];
    if (problemIds.length === 0) return true;
    if (problemIds.some((id) => plan.visiblePrimaryProblemIds.has(id))) return true;
    if (problemIds.every((id) => plan.suppressedProblemIds.has(id))) return false;
    return true;
  });
}

export function findAttentionPrimaryForRisk(
  risk: ActiveRisk,
  plan: AttentionPrimarySsoCutoverPlan,
): UnifiedDecisionItemProjection | undefined {
  for (const problemId of risk.decisionProblemIds ?? []) {
    const match = plan.attentionPrimaryItems.find(
      (item) => item.primaryProblemId === problemId,
    );
    if (match) return match;
  }
  for (const ref of risk.sourceRefs) {
    if (ref.sourceSystem !== 'DECISION_PROBLEM') continue;
    const match = plan.attentionPrimaryItems.find(
      (item) => item.primaryProblemId === ref.sourceId,
    );
    if (match) return match;
  }
  return undefined;
}

export function enrichAlertWithAttentionPrimaryHeadline(
  alert: ExecutionAlertDto,
  primary: UnifiedDecisionItemProjection,
): ExecutionAlertDto {
  if (!alert.userNarrative) return alert;
  const place =
    alert.affectedRoute ?? alert.affectedActivities?.[0] ?? alert.userNarrative.affected?.route;
  const narrative = buildAttentionPrimaryUserNarrative(primary, { place });
  return {
    ...alert,
    userNarrative: {
      ...alert.userNarrative,
      whatHappened: narrative.whatHappened,
      impactOnTrip: narrative.impactOnTrip,
    },
  };
}
