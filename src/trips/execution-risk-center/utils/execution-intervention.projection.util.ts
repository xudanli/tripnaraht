/**
 * Projects Decision Runtime queue items → ExecutionIntervention (Execution Risk Center).
 * @see ExecutionAdjustmentQueue / ExecutionAlert domain model
 */

import type { CausalStoryView } from '../../../causal-protocol/causal-story-view.types';
import type { CausalTraceReference } from '../../../causal-protocol/causal-trace-reference.types';
import type { UnifiedDecisionProblemListItem } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import type { ConsumerDecisionItem } from '../../travel-status/types/travel-status.types';
import type { ActiveRisk } from '../types/execution-risk.types';
import type {
  ExecutionAlertDto,
  ExecutionAlertLevel,
  ExecutionInterventionActionsDto,
  ExecutionInterventionCausalChainDto,
  ExecutionInterventionCausalTraceRefDto,
  ExecutionInterventionDto,
  ExecutionInterventionPriority,
  ExecutionInterventionStatus,
  ExecutionInterventionType,
} from '../../../mobile/dto/mobile-execution.types';

export const EXECUTION_ADJUSTMENT_QUEUE_SCHEMA_ID = 'tripnara.execution_adjustment_queue@v1';
export const EXECUTION_ALERTS_SCHEMA_ID = 'tripnara.execution_alerts@v1';
export const EXECUTION_ALERTS_SCHEMA_V2_ID = 'tripnara.execution_alerts@v2';
export const EXECUTION_INTERVENTION_SCHEMA_ID = 'tripnara.execution_intervention@v1';

const PREP_KEYWORDS = /装备|补水|准备|下载|离线地图|携带|检查/;
const TEAM_KEYWORDS = /集合|成员|团队|对讲|位置共享|汇合/;
const SAFETY_KEYWORDS = /安全|健康|停止|危险|封路|关闭|取消|强风|气温|融化|滑坡/;
const REPLAN_KEYWORDS = /替换|缩短|延后|调整|降雨|天气|路况|交通|缓冲|偏紧|冲突/;

export function projectCausalStoryToChain(story: CausalStoryView): ExecutionInterventionCausalChainDto {
  return {
    headline: story.headline,
    assessment: story.assessment,
    nodes: story.chain.map((node) => ({
      nodeId: node.nodeId,
      type: node.type,
      title: node.title,
      description: node.description,
      sourceRefs: node.sourceRefs,
    })),
    recommendedOption: story.recommendedOption,
    traceId: story.traceId,
    worldStateVersion: story.worldStateVersion,
    technicalTraceRef: story.technicalTraceRef,
  };
}

export function projectCausalTraceRef(
  ref?: CausalTraceReference,
): ExecutionInterventionCausalTraceRefDto | undefined {
  if (!ref) return undefined;
  return {
    traceId: ref.traceId,
    worldStateVersion: ref.worldStateVersion,
    protocolVersion: ref.protocolVersion,
  };
}

export function buildFallbackCausalChain(input: {
  consumer: ConsumerDecisionItem;
  listItem?: UnifiedDecisionProblemListItem;
  type: ExecutionInterventionType;
}): ExecutionInterventionCausalChainDto {
  const { consumer, listItem, type } = input;
  const observeSource =
    listItem?.detectors[0]?.label ??
    listItem?.origin?.primaryDetector ??
    '系统检测到现实状态与当前计划出现偏差';
  const impactText = consumer.impact || '可能影响部分行程安排';
  const assessmentText = consumer.explanation || consumer.impact || consumer.headline;
  const suggestText =
    consumer.recommendation?.title ?? consumer.recommendation?.summary ?? consumer.headline;
  const conflictText = buildConflictConclusion(consumer, type);
  const headlineText = resolveInterventionHeadline(consumer, listItem);

  const nodes: ExecutionInterventionCausalChainDto['nodes'] = [
    {
      nodeId: 'world_change',
      type: 'WORLD_CHANGE',
      title: type === 'TEAM_COORDINATION' ? '团队状态变化' : '环境或计划变化',
      description: observeSource,
      sourceRefs: listItem?.detectors.flatMap((d) => d.sourceRefIds ?? []),
    },
    {
      nodeId: 'impact',
      type: 'IMPACT',
      title: '产生影响',
      description: isGenericImpactCopy(impactText) ? extractFirstClause(assessmentText) : impactText,
    },
    {
      nodeId: 'conflict',
      type: 'CONFLICT',
      title: '决策冲突',
      description: conflictText,
    },
    {
      nodeId: 'option',
      type: 'OPTION',
      title: '建议',
      description: suggestText,
    },
  ];

  return {
    headline: headlineText,
    assessment: assessmentText,
    nodes,
    recommendedOption: consumer.recommendation?.recommendedActionId
      ? {
          optionId: consumer.recommendation.recommendedActionId,
          summary: consumer.recommendation.title,
          expectedImprovement: consumer.recommendation.keeps.join('；') || '尽量保留旅行目标',
          tradeoff: consumer.recommendation.costs.join('；') || undefined,
        }
      : undefined,
  };
}

export function resolveInterventionCausalChain(input: {
  consumer: ConsumerDecisionItem;
  listItem?: UnifiedDecisionProblemListItem;
  type: ExecutionInterventionType;
}): {
  causalChain: ExecutionInterventionCausalChainDto;
  guardianCausalChain?: ExecutionInterventionCausalChainDto;
  causalTraceRef?: ExecutionInterventionCausalTraceRefDto;
} {
  const causalTraceRef = projectCausalTraceRef(input.listItem?.causalTraceRef);

  if (input.listItem?.causalStoryView?.chain?.length) {
    const causalChain = projectCausalStoryToChain(input.listItem.causalStoryView);
    const guardianCausalChain =
      input.type === 'SAFETY_INTERVENTION' &&
      input.listItem.guardianCausalStoryView?.chain?.length
        ? projectCausalStoryToChain(input.listItem.guardianCausalStoryView)
        : undefined;
    return { causalChain, guardianCausalChain, causalTraceRef };
  }

  return {
    causalChain: buildFallbackCausalChain(input),
    causalTraceRef,
  };
}

export function resolveInterventionType(
  listItem: UnifiedDecisionProblemListItem | undefined,
  consumer: ConsumerDecisionItem,
): ExecutionInterventionType {
  const sk = (listItem?.semanticKey ?? '').toLowerCase();
  const text = `${consumer.headline} ${consumer.explanation} ${consumer.impact}`.toLowerCase();

  if (
    sk.includes('safety') ||
    sk.includes('weather_activity_prohibited') ||
    sk.includes('readiness_safety') ||
    sk.includes('health') ||
    SAFETY_KEYWORDS.test(text)
  ) {
    return 'SAFETY_INTERVENTION';
  }

  if (
    listItem?.dimension === 'TEAM_FIT' ||
    sk.includes('meeting') ||
    sk.includes('comms') ||
    TEAM_KEYWORDS.test(text)
  ) {
    return 'TEAM_COORDINATION';
  }

  if (
    consumer.severity === 'OPTIMIZE' ||
    consumer.severity === 'VERIFY' ||
    sk.includes('prep') ||
    sk.includes('equipment') ||
    PREP_KEYWORDS.test(text)
  ) {
    if (PREP_KEYWORDS.test(text) && !REPLAN_KEYWORDS.test(consumer.headline)) {
      return 'EXECUTION_PREPARATION';
    }
    if (consumer.severity === 'OPTIMIZE' && !listItem?.affectsPlan) {
      return 'EXECUTION_PREPARATION';
    }
  }

  return 'DYNAMIC_REPLAN';
}

export function resolveInterventionPriority(
  type: ExecutionInterventionType,
  listItem: UnifiedDecisionProblemListItem | undefined,
  consumer: ConsumerDecisionItem,
): ExecutionInterventionPriority {
  if (consumer.severity === 'BLOCK') {
    if (type === 'SAFETY_INTERVENTION' || listItem?.enforcement === 'BLOCK') {
      return 'CRITICAL';
    }
    return 'HIGH';
  }
  if (consumer.severity === 'CONFLICT') {
    return type === 'TEAM_COORDINATION' ? 'MEDIUM' : 'HIGH';
  }
  if (consumer.severity === 'VERIFY') {
    return 'MEDIUM';
  }
  return 'LOW';
}

export function mapConsumerSeverityToStatus(
  consumer: ConsumerDecisionItem,
): ExecutionInterventionStatus {
  return 'OPEN';
}

export function buildInterventionActions(
  type: ExecutionInterventionType,
  consumer: ConsumerDecisionItem,
  actionDeadline?: string,
): ExecutionInterventionActionsDto {
  const deferLabel = actionDeadline
    ? `稍后处理 · 最晚 ${formatDeadlineLabel(actionDeadline)} 前`
    : '稍后处理';

  switch (type) {
    case 'SAFETY_INTERVENTION':
      return {
        primary: {
          label: '确认调整',
          action: 'accept',
          actionId: consumer.actions.acceptRecommended.actionId,
          enabled: consumer.actions.acceptRecommended.enabled,
        },
        secondary: {
          label: '查看影响',
          action: 'view_impact',
          enabled: true,
        },
        defer: buildDeferAction(consumer, deferLabel),
      };
    case 'DYNAMIC_REPLAN':
      return {
        primary: {
          label: '查看替代方案',
          action: 'view_alternatives',
          enabled: consumer.actions.viewAlternatives.enabled,
          count: consumer.actions.viewAlternatives.count,
        },
        secondary: {
          label: '保留原计划',
          action: 'keep_original',
          actionId: consumer.actions.keepOriginal.actionId,
          enabled: consumer.actions.keepOriginal.enabled,
        },
        defer: buildDeferAction(consumer, deferLabel),
      };
    case 'TEAM_COORDINATION':
      return {
        primary: {
          label: '确认集合点',
          action: 'accept',
          actionId: consumer.actions.acceptRecommended.actionId,
          enabled: consumer.actions.acceptRecommended.enabled,
        },
        secondary: {
          label: '通知成员',
          action: 'notify_team',
          enabled: true,
        },
        defer: buildDeferAction(consumer, deferLabel),
      };
    case 'EXECUTION_PREPARATION':
      return {
        primary: {
          label: '标记已完成',
          action: 'complete',
          actionId: consumer.actions.acceptRecommended.actionId,
          enabled: consumer.actions.acceptRecommended.enabled,
        },
        secondary: {
          label: '稍后提醒',
          action: 'snooze',
          actionId: consumer.actions.defer.actionId,
          enabled: consumer.actions.defer.enabled,
        },
        defer: buildDeferAction(consumer, deferLabel),
      };
  }
}

function buildDeferAction(
  consumer: ConsumerDecisionItem,
  label: string,
): ExecutionInterventionActionsDto['defer'] {
  if (!consumer.actions.defer.enabled) return undefined;
  return {
    label,
    action: 'defer',
    actionId: consumer.actions.defer.actionId,
    enabled: true,
  };
}

export function projectConsumerToIntervention(input: {
  consumer: ConsumerDecisionItem;
  listItem?: UnifiedDecisionProblemListItem;
  tripId: string;
  memberNamesById: Map<string, string>;
  activityTitleById: Map<string, string>;
  actionDeadline?: string;
}): ExecutionInterventionDto {
  const { consumer, listItem, tripId, memberNamesById, activityTitleById, actionDeadline } = input;
  const type = resolveInterventionType(listItem, consumer);
  const priority = resolveInterventionPriority(type, listItem, consumer);

  const affectedMemberIds = listItem?.scope.memberIds ?? [];
  const affectedMembers =
    affectedMemberIds.length > 0
      ? affectedMemberIds.map((id) => memberNamesById.get(id) ?? id)
      : [];

  const itemIds = listItem?.scope.itemIds ?? [];
  const arrangementLabels =
    listItem?.impactScopeView?.arrangements?.map((a) => a.label) ?? [];
  const affectedActivities =
    itemIds.length > 0
      ? itemIds.map((id) => activityTitleById.get(id) ?? id)
      : arrangementLabels.length > 0
        ? arrangementLabels
        : consumer.affectedScopeLabel
          ? [consumer.affectedScopeLabel]
          : [];

  const alternativeActions = consumer.recommendation
    ? [consumer.recommendation.title, ...(consumer.recommendation.costs ?? [])].filter(Boolean)
    : undefined;

  const requiresConfirmation =
    type !== 'EXECUTION_PREPARATION' &&
    (consumer.actions.acceptRecommended.enabled ||
      consumer.actions.viewAlternatives.enabled ||
      consumer.severity === 'BLOCK' ||
      consumer.severity === 'CONFLICT');

  const { causalChain, guardianCausalChain, causalTraceRef } = resolveInterventionCausalChain({
    consumer,
    listItem,
    type,
  });

  const title = resolveInterventionShortTitle(consumer, listItem);
  const reason = resolveInterventionReason(consumer, listItem, causalChain.headline);

  return {
    schemaId: EXECUTION_INTERVENTION_SCHEMA_ID,
    id: consumer.problemId,
    tripId,
    type,
    priority,
    title,
    reason,
    affectedMembers,
    affectedActivities,
    recommendedAction: consumer.recommendation?.title ?? suggestActionFallback(consumer, type),
    alternativeActions,
    actionDeadline,
    evidenceRefs: listItem?.detectors.flatMap((d) => d.sourceRefIds ?? []) ?? [],
    requiresConfirmation,
    autoExecutable: type === 'EXECUTION_PREPARATION' && consumer.severity === 'OPTIMIZE',
    reversible: listItem?.affectsPlan !== false,
    modifiesEffectivePlan: listItem?.affectsPlan ?? requiresConfirmation,
    requiresRevalidation: listItem?.affectsPlan ?? requiresConfirmation,
    status: mapConsumerSeverityToStatus(consumer),
    decisionProblemId: consumer.problemId,
    actions: buildInterventionActions(type, consumer, actionDeadline),
    causalChain,
    guardianCausalChain,
    causalTraceRef,
    recommendation: consumer.recommendation
      ? {
          title: consumer.recommendation.title,
          summary: consumer.recommendation.summary,
          keeps: consumer.recommendation.keeps,
          costs: consumer.recommendation.costs,
          recommendedActionId: consumer.recommendation.recommendedActionId,
        }
      : undefined,
  };
}

export function resolveAlertLevel(input: {
  enforcement?: string;
  severity?: string;
  semanticKey?: string;
  envSeverity?: string;
  type?: ExecutionInterventionType;
}): ExecutionAlertLevel {
  const sk = (input.semanticKey ?? '').toLowerCase();
  if (
    input.enforcement === 'BLOCK' ||
    input.envSeverity === 'red' ||
    sk.includes('road_segment_unavailable') ||
    sk.includes('weather_activity_prohibited')
  ) {
    return input.type === 'SAFETY_INTERVENTION' || input.envSeverity === 'red'
      ? 'STOP'
      : 'REPLAN_REQUIRED';
  }
  if (input.severity === 'BLOCK' || input.severity === 'critical' || input.severity === 'high') {
    return 'REPLAN_REQUIRED';
  }
  return 'AT_RISK';
}

export function buildExecutionAlert(input: {
  id: string;
  level: ExecutionAlertLevel;
  title: string;
  reason: string;
  impact: string;
  affectedActivities: string[];
  evidenceRefs: string[];
  observedAt: string;
}): ExecutionAlertDto {
  return {
    id: input.id,
    level: input.level,
    title: input.title,
    reason: input.reason,
    impact: input.impact,
    affectedActivities: input.affectedActivities,
    evidenceRefs: input.evidenceRefs,
    observedAt: input.observedAt,
    requiresImmediateAttention: input.level === 'STOP' || input.level === 'REPLAN_REQUIRED',
  };
}

export function prioritySortWeight(priority: ExecutionInterventionPriority): number {
  switch (priority) {
    case 'CRITICAL':
      return 0;
    case 'HIGH':
      return 1;
    case 'MEDIUM':
      return 2;
    case 'LOW':
      return 3;
  }
}

export function alertLevelSortWeight(level: ExecutionAlertLevel): number {
  switch (level) {
    case 'STOP':
      return 0;
    case 'REPLAN_REQUIRED':
      return 1;
    case 'AT_RISK':
      return 2;
  }
}

function formatDeadlineLabel(isoOrTime: string): string {
  const d = new Date(isoOrTime);
  if (Number.isNaN(d.getTime())) return isoOrTime;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function isScheduleTightnessIssue(listItem?: UnifiedDecisionProblemListItem): boolean {
  const sk = (listItem?.semanticKey ?? '').toLowerCase();
  return isScheduleTightnessSemanticKey(sk);
}

export function isScheduleTightnessSemanticKey(semanticKey: string): boolean {
  const sk = semanticKey.toLowerCase();
  return (
    sk.includes('same_day_travel') ||
    sk.includes('buffer_insufficient') ||
    sk.includes('transfer_buffer') ||
    sk.includes('meal_window') ||
    sk.includes('daily_fatigue')
  );
}

/** Prod riskKey may use `travel|{day}` instead of `same_day_travel:dayN`. */
export function isSameDayTravelScheduleRisk(risk: ActiveRisk): boolean {
  const parts = risk.riskKey.split('|');
  const subject = (parts[3] ?? '').toLowerCase();
  const scope = parts[4] ?? '';
  if (isScheduleTightnessSemanticKey(subject)) return true;
  if (subject === 'travel' && /^\d+$/.test(scope)) return true;
  if (/同日交通/.test(risk.title)) return true;
  return false;
}

/** Short card title (≤16 chars) — semanticKey mapping or truncated DP title */
export function resolveInterventionShortTitle(
  consumer: ConsumerDecisionItem,
  listItem?: UnifiedDecisionProblemListItem,
): string {
  const sk = (listItem?.semanticKey ?? '').toLowerCase();
  if (sk.includes('same_day_travel')) return '同日交通偏紧';
  if (sk.includes('buffer_insufficient')) return '缓冲不足';
  if (sk.includes('transfer_buffer')) return '转场缓冲不足';
  if (sk.includes('meal_window')) return '用餐窗口冲突';
  if (sk.includes('daily_fatigue')) return '当日疲劳偏高';

  const raw = (listItem?.title ?? consumer.headline).trim();
  return truncateShortTitle(raw, 16);
}

/** User-facing conclusion — longer than title, complements reason */
export function resolveInterventionHeadline(
  consumer: ConsumerDecisionItem,
  listItem?: UnifiedDecisionProblemListItem,
): string {
  const explanation = consumer.explanation?.trim();
  const title = (listItem?.title ?? consumer.headline).trim();
  if (explanation && explanation !== title && explanation.length > title.length) {
    return explanation;
  }
  const impact = consumer.impact?.trim();
  if (impact && !isGenericImpactCopy(impact) && impact !== title) {
    return `${title}：${impact}`;
  }
  return explanation || title;
}

/** Factual support copy — distance/time/scope; must not contradict headline direction */
export function resolveInterventionReason(
  consumer: ConsumerDecisionItem,
  listItem: UnifiedDecisionProblemListItem | undefined,
  headline: string,
): string {
  const explanation = consumer.explanation?.trim();
  const impact = consumer.impact?.trim();
  const shortTitle = resolveInterventionShortTitle(consumer, listItem);

  if (explanation && explanation !== shortTitle) {
    return explanation;
  }
  if (impact && impact !== headline && impact !== shortTitle && !isGenericImpactCopy(impact)) {
    return impact;
  }

  const parts: string[] = [];
  const days = consumer.affectedDayNumbers;
  if (days?.length === 1) parts.push(`Day ${days[0]}`);
  else if (days && days.length > 1) parts.push(`Day ${days.join('、')}`);

  const arrangements = listItem?.impactScopeView?.arrangements ?? [];
  if (arrangements.length > 0) {
    parts.push(arrangements.map((a) => a.label).join(' → '));
  }
  if (parts.length > 0) return parts.join(' · ');
  return explanation || impact || headline;
}

function isGenericImpactCopy(impact: string): boolean {
  return /^影响(第\s*\d+天|部分|当前)/.test(impact);
}

function truncateShortTitle(text: string, maxLen: number): string {
  const t = text.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}…`;
}

function suggestActionFallback(
  consumer: ConsumerDecisionItem,
  type: ExecutionInterventionType,
): string {
  if (type === 'DYNAMIC_REPLAN') return '查看替代方案';
  if (type === 'TEAM_COORDINATION') return '确认团队安排';
  if (type === 'EXECUTION_PREPARATION') return '标记已完成';
  return consumer.headline;
}

function buildConflictConclusion(
  consumer: ConsumerDecisionItem,
  type: ExecutionInterventionType,
): string {
  if (consumer.severity === 'BLOCK') {
    return '按当前计划无法继续执行';
  }
  switch (type) {
    case 'DYNAMIC_REPLAN':
      return '按现计划可能无法准时完成安排';
    case 'TEAM_COORDINATION':
      return '团队状态与当前安排存在偏差';
    case 'SAFETY_INTERVENTION':
      return '原方案不满足当前安全条件';
    case 'EXECUTION_PREPARATION':
      return '出发前仍需完成准备事项';
    default:
      return '需要您确认后再继续';
  }
}

function extractFirstClause(text: string): string {
  const clause = text.split(/[；;。]/)[0]?.trim();
  return clause && clause.length > 0 ? clause : text;
}

/** Schedule / buffer issues belong in adjustment-queue only (layer 2). */
export function isScheduleTightnessRisk(risk: ActiveRisk): boolean {
  if (isSameDayTravelScheduleRisk(risk)) return true;
  const subject = risk.riskKey.split('|')[3] ?? '';
  if (isScheduleTightnessSemanticKey(subject)) return true;
  if (
    risk.type === 'SCHEDULE' &&
    risk.executionGate !== 'STOP' &&
    risk.sourceRefs.some((s) => s.sourceSystem === 'DECISION_PROBLEM')
  ) {
    return true;
  }
  return false;
}

export function isExecutionAlertEligibleRisk(risk: ActiveRisk): boolean {
  return !isScheduleTightnessRisk(risk);
}
