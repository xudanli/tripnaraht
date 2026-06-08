import { resolveVaultMilestoneLabels } from '../config/trip-contextual-cards.config';
import { readActiveTripDecisionLoopFromMetadata } from './route-rollback-decision.engine';
import { readCollaborativeTaskFlywheelFromMetadata } from './collaborative-task-behavior.engine';
import { normalizeRouteContractLockMetadata } from './route-contract-lock.engine';
import type {
  ActiveTripDecisionReplayView,
  ActiveTripReplayFlywheelMetrics,
  ActiveTripReplayKeyDecisionPoint,
  ActiveTripReplayPersonaSections,
  ActiveTripReplayTimelineEntry,
  RouteTemplateTripBackflowPreview,
} from '../types/active-trip-decision-replay.types';
import { ACTIVE_TRIP_DECISION_REPLAY_VERSION } from '../types/active-trip-decision-replay.types';

export interface BuildActiveTripDecisionReplayInput {
  tripId: string;
  metadata: unknown;
  crewUserIds: string[];
}

function readInstantiation(metadata: unknown): {
  recruitmentPostId: string | null;
  catalogId: string | null;
  routeDirectionName: string | null;
} {
  if (!metadata || typeof metadata !== 'object') {
    return { recruitmentPostId: null, catalogId: null, routeDirectionName: null };
  }
  const inst = (metadata as Record<string, unknown>).matchSquareInstantiation;
  if (!inst || typeof inst !== 'object') {
    return { recruitmentPostId: null, catalogId: null, routeDirectionName: null };
  }
  const o = inst as Record<string, unknown>;
  return {
    recruitmentPostId: typeof o.recruitmentPostId === 'string' ? o.recruitmentPostId : null,
    catalogId: typeof o.catalogId === 'string' ? o.catalogId : null,
    routeDirectionName: typeof o.routeDirectionName === 'string' ? o.routeDirectionName : null,
  };
}

function summarizeCollaborativeTaskEvent(input: {
  action: string;
  taskTitle?: string;
  revisionCountAfter?: number | null;
  responseLatencyMs?: number | null;
}): string {
  const title = input.taskTitle ?? '协同任务';
  switch (input.action) {
    case 'confirm':
      return `✅ ${title} 已确认${
        input.responseLatencyMs != null
          ? `（响应 ${Math.round(input.responseLatencyMs / 3600000)}h）`
          : ''
      }`;
    case 'rollback':
      return `↩️ ${title} 回滚修订（第 ${input.revisionCountAfter ?? 1} 次）`;
    case 'ack_timeout':
      return `⏱️ ${title} 被队长标记超时未响应`;
    default:
      return `${title} · ${input.action}`;
  }
}

function buildTimeline(metadata: unknown): ActiveTripReplayTimelineEntry[] {
  const entries: ActiveTripReplayTimelineEntry[] = [];

  const flywheel = readCollaborativeTaskFlywheelFromMetadata(metadata);
  const taskTitleById = new Map(flywheel?.tasks.map((t) => [t.taskId, t.title]) ?? []);

  for (const e of flywheel?.behaviorLog ?? []) {
    entries.push({
      eventId: e.eventId,
      at: e.at,
      source: 'collaborative_task',
      action: e.action,
      actorUserId: e.actorUserId,
      summaryZh: summarizeCollaborativeTaskEvent({
        action: e.action,
        taskTitle: taskTitleById.get(e.taskId),
        revisionCountAfter: e.revisionCountAfter,
        responseLatencyMs: e.responseLatencyMs ?? null,
      }),
      taskId: e.taskId,
      responseLatencyMs: e.responseLatencyMs ?? null,
      revisionCountAfter: e.revisionCountAfter,
    });
  }

  const decisionLoop = readActiveTripDecisionLoopFromMetadata(metadata);
  for (const e of decisionLoop?.eventLog ?? []) {
    if (e.actorUserId === 'system') continue;
    let summary = `路线 Rollback · ${e.action}`;
    if (e.action === 'propose') summary = `🧭 队长发起 Plan B：${e.planBRef ?? '未命名方案'}`;
    if (e.action === 'confirm') summary = '👍 队员确认 Plan B 改线提案';
    if (e.action === 'protest') summary = `🙅 队员对 Plan B 提出异议${e.note ? `：${e.note}` : ''}`;

    entries.push({
      eventId: e.eventId,
      at: e.at,
      source: 'route_rollback',
      action: e.action,
      actorUserId: e.actorUserId,
      summaryZh: summary,
      proposalId: e.proposalId,
      milestoneId: e.milestoneId ?? null,
    });
  }

  const vaultLock = normalizeRouteContractLockMetadata(
    (metadata as Record<string, unknown>)?.routeContractLock,
  );
  const milestoneLabels = new Map(
    resolveVaultMilestoneLabels(vaultLock?.milestoneIds ?? []).map((m) => [m.id, m.labelZh]),
  );

  for (const e of vaultLock?.eventLog ?? []) {
    let summary = `Vault 契约 · ${e.action}`;
    if (e.action === 'authorize') {
      const label = e.milestoneId ? milestoneLabels.get(e.milestoneId) : null;
      summary = label
        ? `🔐 签署里程碑「${label}」资金授权`
        : '🔐 签署 Route Contract 里程碑授权';
    }
    if (e.action === 'reorder') {
      summary = `📋 队长 rollback 里程碑顺序${e.note ? `：${e.note}` : ''}`;
    }

    entries.push({
      eventId: e.eventId,
      at: e.at,
      source: 'vault_contract',
      action: e.action,
      actorUserId: e.actorUserId,
      summaryZh: summary,
      milestoneId: e.milestoneId ?? null,
    });
  }

  return entries.sort((a, b) => a.at.localeCompare(b.at));
}

function computeMetrics(timeline: ActiveTripReplayTimelineEntry[]): ActiveTripReplayFlywheelMetrics {
  const taskEvents = timeline.filter((e) => e.source === 'collaborative_task');
  const rollbackEvents = timeline.filter((e) => e.source === 'route_rollback');
  const vaultEvents = timeline.filter((e) => e.source === 'vault_contract');

  const confirmLatencies = taskEvents
    .filter((e) => e.action === 'confirm' && e.responseLatencyMs != null)
    .map((e) => e.responseLatencyMs as number);

  const revisionTotal = taskEvents
    .filter((e) => e.action === 'rollback')
    .reduce((sum, e) => sum + (e.revisionCountAfter ?? 1), 0);

  return {
    collaborativeTaskEvents: taskEvents.length,
    routeRollbackEvents: rollbackEvents.length,
    vaultContractEvents: vaultEvents.length,
    taskConfirmLatencyMsAvg:
      confirmLatencies.length > 0
        ? Math.round(confirmLatencies.reduce((a, b) => a + b, 0) / confirmLatencies.length)
        : null,
    routeRollbackConfirmLatencyMs: null,
    taskRevisionTotal: revisionTotal,
  };
}

function buildKeyDecisionPoints(timeline: ActiveTripReplayTimelineEntry[]): ActiveTripReplayKeyDecisionPoint[] {
  const points: ActiveTripReplayKeyDecisionPoint[] = [];

  for (const e of timeline) {
    if (e.source === 'route_rollback' && e.action === 'propose') {
      points.push({
        at: e.at,
        titleZh: '队长发起 Plan B 改线',
        abuInsightZh:
          'Abu：改线提案已进入全员确认门禁；在共识达成前，原路线约束仍视为有效安全边界。',
        evidenceRefs: e.proposalId ? [`proposal:${e.proposalId}`] : [],
      });
    }
    if (e.source === 'collaborative_task' && e.action === 'confirm' && /涉水|DEM|卫星/i.test(e.summaryZh)) {
      points.push({
        at: e.at,
        titleZh: '高风险行前任务确认',
        abuInsightZh:
          'Abu：涉水/DEM/卫星类任务确认意味着队伍已把物理风险转化为可审计的契约节点，而非口头承诺。',
        evidenceRefs: e.taskId ? [`task:${e.taskId}`] : [],
      });
    }
    if (e.source === 'vault_contract' && e.action === 'authorize') {
      points.push({
        at: e.at,
        titleZh: 'Vault 里程碑授权',
        abuInsightZh: 'Abu：里程碑资金授权锁定后，行中变更须走 Rollback 决策环而非静默绕过。',
        evidenceRefs: e.milestoneId ? [`milestone:${e.milestoneId}`] : [],
      });
    }
  }

  return points.slice(-8);
}

function buildPersonaSections(
  timeline: ActiveTripReplayTimelineEntry[],
  metrics: ActiveTripReplayFlywheelMetrics,
): ActiveTripReplayPersonaSections {
  const safetyTasks = timeline.filter(
    (e) => e.source === 'collaborative_task' && /涉水|DEM|卫星|安全/i.test(e.summaryZh),
  );
  const rollbacks = timeline.filter((e) => e.source === 'route_rollback');
  const vault = timeline.filter((e) => e.source === 'vault_contract');

  const abu =
    safetyTasks.length > 0 || rollbacks.some((e) => e.action === 'protest')
      ? `安全守护者 Abu：本次车队共记录 ${safetyTasks.length} 项高风险行前确认${
          rollbacks.some((e) => e.action === 'protest')
            ? '；曾出现 Plan B 异议，说明团队在物理风险上存在真实分歧而非表面一致'
            : ''
        }。这些行为数据将反哺下一次拼团的前置 CSP 预演。`
      : '安全守护者 Abu：尚未捕获高风险任务确认或改线争议；建议行前完成涉水/DEM 类协同任务。';

  const drDre =
    metrics.taskConfirmLatencyMsAvg != null
      ? `节奏调节者 Dr.Dre：协同任务平均确认耗时约 ${Math.round(metrics.taskConfirmLatencyMsAvg / 3600000)} 小时${
          metrics.taskRevisionTotal > 0
            ? `，共 ${metrics.taskRevisionTotal} 次回滚修订，队伍准备节奏存在波动`
            : ''
        }。`
      : '节奏调节者 Dr.Dre：暂无任务确认时序数据；成团后请尽快派发并确认行前清单。';

  const neptune =
    rollbacks.length > 0 || vault.some((e) => e.action === 'reorder')
      ? `路线守护者 Neptune：记录 ${rollbacks.length} 条改线决策事件${
          vault.some((e) => e.action === 'reorder') ? '，且队长曾 rollback 里程碑顺序' : ''
        }；路线契约与 Plan B 均可在 Replay 中追溯。`
      : '路线守护者 Neptune：行中尚未触发 Plan B 改线；当前仍执行成团锁定的路线模板实例。';

  return { abu, drDre, neptune };
}

export function buildActiveTripDecisionReplayView(
  input: BuildActiveTripDecisionReplayInput,
): ActiveTripDecisionReplayView {
  const inst = readInstantiation(input.metadata);
  const timeline = buildTimeline(input.metadata);
  const metrics = computeMetrics(timeline);
  const personaSections = buildPersonaSections(timeline, metrics);

  return {
    version: ACTIVE_TRIP_DECISION_REPLAY_VERSION,
    tripId: input.tripId,
    recruitmentPostId: inst.recruitmentPostId,
    catalogId: inst.catalogId,
    timeline,
    keyDecisionPoints: buildKeyDecisionPoints(timeline),
    personaSections,
    abuNarrative: personaSections.abu,
    flywheelMetrics: metrics,
    generatedAt: new Date().toISOString(),
  };
}

export function buildRouteTemplateTripBackflowPreview(input: {
  metadata: unknown;
  crewUserIds: string[];
}): RouteTemplateTripBackflowPreview | null {
  const inst = readInstantiation(input.metadata);
  if (!inst.catalogId && !inst.routeDirectionName) return null;

  const timeline = buildTimeline(input.metadata);
  const flywheel = readCollaborativeTaskFlywheelFromMetadata(input.metadata);
  const tasks = flywheel?.tasks ?? [];
  const confirmed = tasks.filter((t) => t.status === 'confirmed').length;
  const taskCompletionRate = tasks.length > 0 ? confirmed / tasks.length : 0;

  const rollbackEvents = timeline.filter((e) => e.source === 'route_rollback');
  const rollbackConfirmed = rollbackEvents.filter((e) => e.action === 'confirm').length;
  const rollbackProposed = rollbackEvents.filter((e) => e.action === 'propose').length;
  const rollbackConsensusRate =
    rollbackProposed > 0 ? rollbackConfirmed / rollbackProposed : null;

  const vaultLock = normalizeRouteContractLockMetadata(
    (input.metadata as Record<string, unknown>)?.routeContractLock,
  );
  const vaultAuthorizationRate =
    vaultLock && vaultLock.milestones.length > 0
      ? vaultLock.milestones.filter(
          (m) => m.vaultStatus === 'locked' || m.vaultStatus === 'authorized',
        ).length / vaultLock.milestones.length
      : null;

  const featureTags: string[] = [];
  if (taskCompletionRate >= 0.8) featureTags.push('high_pre_trip_task_completion');
  if (rollbackConsensusRate != null && rollbackConsensusRate >= 1) {
    featureTags.push('unanimous_plan_b_consensus');
  }
  if (vaultLock?.locked) featureTags.push('vault_contract_sealed');

  return {
    catalogId: inst.catalogId,
    routeDirectionName: inst.routeDirectionName,
    anonymizedCrewSize: Math.max(1, input.crewUserIds.length),
    taskCompletionRate: Math.round(taskCompletionRate * 100) / 100,
    rollbackConsensusRate,
    vaultAuthorizationRate,
    suggestedExampleTitleZh: inst.catalogId
      ? `搭子车队成功范例 · ${inst.catalogId}`
      : 'Match Square 成团成功范例',
    suggestedExampleSummaryZh: `匿名 ${input.crewUserIds.length} 人车队：行前任务完成率 ${Math.round(taskCompletionRate * 100)}%${
      vaultLock?.locked ? '，Vault 契约已全员锁定' : ''
    }。`,
    featureTags,
  };
}
