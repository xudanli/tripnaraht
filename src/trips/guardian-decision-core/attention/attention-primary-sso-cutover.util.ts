/**
 * Slice 4 Phase C — filter user-visible queue via Attention Primary SSO.
 */

import type { ExecutionInterventionDto } from '../../../mobile/dto/mobile-execution.types';
import type {
  RootCauseCluster,
  UnifiedDecisionItemProjection,
} from '../contracts/attention-orchestration.types';
import type { AttentionShadowRunOutput } from './attention-shadow-run.util';
import { buildAttentionPrimaryUserNarrative } from './attention-primary-user-narrative.util';
import { isPlanningLayerDecisionProblem } from '../../../decision-runtime/gateway/utils/plan-object-execution-admission.util';

/** Align with Slice 4 shadow ingest normalization. */
export function normalizeSemanticForPrimarySsoDedup(semantic: string): string {
  if (semantic === 'WEATHER_ACTIVITY_PROHIBITED') return 'WEATHER_STRONG_WIND';
  return semantic;
}

/** e.g. dp_anchor:environment:EXECUTION_SCHEDULE_INFEASIBLE:activityId */
export function extractSemanticFromAnchorProblemId(problemId: string): string | undefined {
  const match = problemId.match(/dp_anchor:[^:]+:([A-Z0-9_]+)/i);
  return match?.[1];
}

export function resolveSemanticKeyForIntervention(
  item: Pick<ExecutionInterventionDto, 'decisionProblemId' | 'id'>,
  semanticByProblemId?: Map<string, string>,
): string | undefined {
  const problemId = resolveInterventionProblemId(item);
  if (!problemId) return undefined;
  const direct = semanticByProblemId?.get(problemId);
  if (direct) return direct;
  return extractSemanticFromAnchorProblemId(problemId);
}

export interface AttentionPrimarySsoCutoverPlan {
  schemaId: typeof import('../config/attention-primary-sso.config').ATTENTION_PRIMARY_SSO_CUTOVER_SCHEMA_ID;
  tripId: string;
  visiblePrimaryProblemIds: Set<string>;
  suppressedProblemIds: Set<string>;
  attentionPrimaryItems: UnifiedDecisionItemProjection[];
  shadowClusters: RootCauseCluster[];
}

export function buildAttentionPrimarySsoCutoverPlan(
  tripId: string,
  projection: Pick<
    AttentionShadowRunOutput,
    'shadowPrimaryItems' | 'shadowClusters' | 'legacyVisible'
  >,
): AttentionPrimarySsoCutoverPlan {
  const visiblePrimaryProblemIds = new Set(
    projection.shadowPrimaryItems.map((item) => item.primaryProblemId),
  );

  const suppressedProblemIds = new Set<string>();
  for (const item of projection.shadowPrimaryItems) {
    for (const effect of item.relatedEffects) {
      suppressedProblemIds.add(effect.problemId);
    }
  }

  for (const cluster of projection.shadowClusters) {
    if (cluster.status !== 'OPEN') continue;
    for (const relatedId of cluster.relatedProblemIds) {
      if (!visiblePrimaryProblemIds.has(relatedId)) {
        suppressedProblemIds.add(relatedId);
      }
    }
  }

  expandSuppressedCanonicalSemanticDuplicates({
    legacyVisible: projection.legacyVisible,
    shadowPrimaryItems: projection.shadowPrimaryItems,
    visiblePrimaryProblemIds,
    suppressedProblemIds,
  });

  return {
    schemaId: 'tripnara.attention_primary_sso_cutover@v1',
    tripId,
    visiblePrimaryProblemIds,
    suppressedProblemIds,
    attentionPrimaryItems: projection.shadowPrimaryItems,
    shadowClusters: projection.shadowClusters,
  };
}

function expandSuppressedCanonicalSemanticDuplicates(input: {
  legacyVisible: Array<{ problemId: string; semanticKey: string }>;
  shadowPrimaryItems: UnifiedDecisionItemProjection[];
  visiblePrimaryProblemIds: Set<string>;
  suppressedProblemIds: Set<string>;
}): void {
  const primaryBySemantic = new Map<string, string>();
  for (const item of input.shadowPrimaryItems) {
    const norm = normalizeSemanticForPrimarySsoDedup(item.primarySemanticCapability);
    primaryBySemantic.set(norm, item.primaryProblemId);
  }

  for (const legacy of input.legacyVisible) {
    if (input.visiblePrimaryProblemIds.has(legacy.problemId)) continue;
    let norm = normalizeSemanticForPrimarySsoDedup(legacy.semanticKey);
    if (!primaryBySemantic.has(norm)) {
      const embedded = extractSemanticFromAnchorProblemId(legacy.problemId);
      if (embedded) norm = normalizeSemanticForPrimarySsoDedup(embedded);
    }
    const primaryId = primaryBySemantic.get(norm);
    if (primaryId && primaryId !== legacy.problemId) {
      input.suppressedProblemIds.add(legacy.problemId);
    }
  }
}

export function resolveInterventionProblemId(
  item: Pick<ExecutionInterventionDto, 'decisionProblemId' | 'id'>,
): string | undefined {
  return item.decisionProblemId?.trim() || item.id?.trim() || undefined;
}

/** Hide queue items merged into an Attention Primary cluster (non-primary members). */
export function shouldSuppressInterventionForPrimarySso(
  item: Pick<ExecutionInterventionDto, 'decisionProblemId' | 'id'>,
  plan: AttentionPrimarySsoCutoverPlan,
): boolean {
  const problemId = resolveInterventionProblemId(item);
  if (!problemId) return false;
  if (plan.visiblePrimaryProblemIds.has(problemId)) return false;
  return plan.suppressedProblemIds.has(problemId);
}

export function planHasExecutionScheduleInfeasiblePrimary(
  plan: AttentionPrimarySsoCutoverPlan,
): boolean {
  return plan.attentionPrimaryItems.some(
    (primary) =>
      primary.primarySemanticCapability === 'EXECUTION_SCHEDULE_INFEASIBLE' ||
      primary.primarySemanticCapability === 'EXECUTION_SLIP',
  );
}

/** 规划期 Plan Object / 日程可行性 — 执行阶段 suppress，不折叠进 Primary 叙事。 */
export function isMealWindowPlanObjectIntervention(
  item: Pick<ExecutionInterventionDto, 'decisionProblemId' | 'id' | 'title' | 'reason'>,
  semanticByProblemId?: Map<string, string>,
): boolean {
  const problemId = resolveInterventionProblemId(item);
  const semantic = resolveSemanticKeyForIntervention(item, semanticByProblemId);
  if (isPlanningLayerDecisionProblem({ problemId, semanticKey: semantic })) return true;
  return /同日交通偏紧|交通偏紧/.test(`${item.title ?? ''} ${item.reason ?? ''}`);
}

/** 执行期日程衍生（时间冲突等）— 可折叠进 Primary infeasible 卡。 */
export function isExecutionScheduleCascadeFoldIntervention(
  item: Pick<ExecutionInterventionDto, 'decisionProblemId' | 'id' | 'title' | 'reason'>,
  semanticByProblemId?: Map<string, string>,
): boolean {
  if (isMealWindowPlanObjectIntervention(item, semanticByProblemId)) return false;

  const problemId = resolveInterventionProblemId(item);
  if (problemId && /issue-time-conflict/i.test(problemId)) return true;

  const semantic = resolveSemanticKeyForIntervention(item, semanticByProblemId);
  if (semantic && /time_conflict/i.test(semantic)) return true;

  const copy = `${item.title ?? ''} ${item.reason ?? ''}`;
  return /时间重叠|time.?conflict/i.test(copy);
}

/** Schedule derivatives hidden under Primary infeasible during execution (not Plan Object). */
export function isPrimarySsoCascadeConsequenceIntervention(
  item: Pick<ExecutionInterventionDto, 'decisionProblemId' | 'id' | 'title' | 'reason'>,
  semanticByProblemId?: Map<string, string>,
): boolean {
  return isExecutionScheduleCascadeFoldIntervention(item, semanticByProblemId);
}

export function shouldSuppressPrimarySsoCascadeConsequence(
  item: Pick<ExecutionInterventionDto, 'decisionProblemId' | 'id' | 'title' | 'reason'>,
  plan: AttentionPrimarySsoCutoverPlan,
  semanticByProblemId?: Map<string, string>,
): boolean {
  if (!planHasExecutionScheduleInfeasiblePrimary(plan)) return false;
  const problemId = resolveInterventionProblemId(item);
  if (problemId && plan.visiblePrimaryProblemIds.has(problemId)) return false;
  return isPrimarySsoCascadeConsequenceIntervention(item, semanticByProblemId);
}

export function pickCascadeConsequenceLine(
  item: Pick<ExecutionInterventionDto, 'title' | 'reason'>,
): string | undefined {
  const reason = item.reason?.trim();
  const title = item.title?.trim();
  if (reason && reason !== title) return reason;
  if (reason && /重叠|冲突|顺延/.test(reason)) return reason;
  return title || reason;
}

export function appendCascadeConsequencesToVisiblePrimaryIntervention<
  T extends ExecutionInterventionDto,
>(item: T, plan: AttentionPrimarySsoCutoverPlan, consequenceLines: string[]): T {
  const problemId = resolveInterventionProblemId(item);
  if (!problemId || !plan.visiblePrimaryProblemIds.has(problemId)) return item;
  if (consequenceLines.length === 0) return item;

  const existing = `${item.reason ?? ''} ${item.userNarrative?.impactOnTrip ?? ''}`;
  const novel = consequenceLines.filter((line) => line && !existing.includes(line));
  if (novel.length === 0) return item;

  const supplement = novel.join('；');
  return {
    ...item,
    reason: [item.reason?.trim(), supplement].filter(Boolean).join('；'),
  };
}

export function filterInterventionsForPrimarySso<T extends ExecutionInterventionDto>(
  items: T[],
  plan: AttentionPrimarySsoCutoverPlan,
  semanticByProblemId?: Map<string, string>,
): T[] {
  const cascadeConsequences: string[] = [];

  const filtered = items.filter((item) => {
    if (isMealWindowPlanObjectIntervention(item, semanticByProblemId)) return false;
    if (shouldSuppressInterventionForPrimarySso(item, plan)) return false;
    if (shouldSuppressPrimarySsoCascadeConsequence(item, plan, semanticByProblemId)) {
      if (isExecutionScheduleCascadeFoldIntervention(item, semanticByProblemId)) {
        const line = pickCascadeConsequenceLine(item);
        if (line) cascadeConsequences.push(line);
      }
      return false;
    }
    const problemId = resolveInterventionProblemId(item);
    if (!problemId || plan.visiblePrimaryProblemIds.has(problemId)) return true;
    const semantic = resolveSemanticKeyForIntervention(item, semanticByProblemId);
    if (!semantic) return true;
    const norm = normalizeSemanticForPrimarySsoDedup(semantic);
    for (const primary of plan.attentionPrimaryItems) {
      if (normalizeSemanticForPrimarySsoDedup(primary.primarySemanticCapability) !== norm) {
        continue;
      }
      if (primary.primaryProblemId !== problemId) {
        return false;
      }
    }
    return true;
  });

  if (cascadeConsequences.length === 0) return filtered;

  return filtered.map((item) =>
    appendCascadeConsequencesToVisiblePrimaryIntervention(item, plan, cascadeConsequences),
  );
}

export function findAttentionPrimaryForIntervention(
  item: Pick<ExecutionInterventionDto, 'decisionProblemId' | 'id'>,
  plan: AttentionPrimarySsoCutoverPlan,
): UnifiedDecisionItemProjection | undefined {
  const problemId = resolveInterventionProblemId(item);
  if (!problemId) return undefined;
  return plan.attentionPrimaryItems.find((primary) => primary.primaryProblemId === problemId);
}

export function mergePrimaryCascadeIntoUserNarrative(
  item: ExecutionInterventionDto,
): ExecutionInterventionDto {
  if (!item.userNarrative?.impactOnTrip || !item.reason?.includes('；')) return item;
  const segments = item.reason
    .split('；')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length <= 1) return item;

  const supplements = segments.slice(1);
  const impact = item.userNarrative.impactOnTrip;
  const novel = supplements.filter((line) => line && !impact.includes(line));
  if (novel.length === 0) return item;

  return {
    ...item,
    userNarrative: {
      ...item.userNarrative,
      impactOnTrip: [impact, ...novel].join('；'),
    },
  };
}

export function enrichInterventionWithAttentionPrimary(
  item: ExecutionInterventionDto,
  primary: UnifiedDecisionItemProjection,
): ExecutionInterventionDto {
  const affectedActivities =
    item.userNarrative?.affected?.activities ??
    item.affectedActivities?.map((label) => ({ label }));
  const place =
    inferRouteFromActivities(item.affectedActivities) ?? affectedActivities?.[0]?.label;
  const narrative = buildAttentionPrimaryUserNarrative(primary, { place });

  return {
    ...item,
    userNarrative: {
      whatHappened: narrative.whatHappened,
      impactOnTrip: narrative.impactOnTrip,
      recommendation: item.userNarrative?.recommendation ?? '查看替代方案后再决定下一步',
      affected: affectedActivities?.length
        ? { activities: affectedActivities }
        : item.userNarrative?.affected,
    },
  };
}

function inferRouteFromActivities(activities: string[]): string | undefined {
  if (activities.length >= 2) {
    return `${activities[0]} → ${activities[activities.length - 1]}`;
  }
  return activities[0];
}
