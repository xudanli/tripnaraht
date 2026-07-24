import type { ActiveRisk } from '../types/execution-risk.types';
import type {
  ExecutionInterventionActionsDto,
  ExecutionInterventionCausalChainDto,
  ExecutionInterventionDto,
  ExecutionInterventionPriority,
  ExecutionInterventionType,
} from '../../../mobile/dto/mobile-execution.types';
import {
  EXECUTION_INTERVENTION_SCHEMA_ID,
} from '../utils/execution-intervention.projection.util';
import { resolveAffectedMemberLabelsFromRisks } from '../utils/execution-risk-member.util';

export function findLinkedRisksForDecisionProblem(
  risks: ActiveRisk[],
  problemId: string,
): ActiveRisk[] {
  return risks.filter(
    (r) =>
      r.decisionProblemIds.includes(problemId) ||
      r.sourceRefs.some((s) => s.sourceSystem === 'DECISION_PROBLEM' && s.sourceId === problemId),
  );
}

export function findLinkedRisksForIntervention(
  risks: ActiveRisk[],
  intervention: Pick<ExecutionInterventionDto, 'decisionProblemId' | 'id'>,
): ActiveRisk[] {
  if (intervention.decisionProblemId) {
    return findLinkedRisksForDecisionProblem(risks, intervention.decisionProblemId);
  }
  return risks.filter((r) => r.interventionIds.includes(intervention.id));
}

export function enrichInterventionWithRiskLinks(
  intervention: ExecutionInterventionDto,
  risks: ActiveRisk[],
  opts?: { memberNamesById?: Map<string, string> },
): ExecutionInterventionDto {
  const linked = findLinkedRisksForIntervention(risks, intervention);
  const fromRisks = resolveAffectedMemberLabelsFromRisks(linked);

  let affectedMembers = intervention.affectedMembers;
  if (affectedMembers.length === 0 && fromRisks.length > 0) {
    affectedMembers = fromRisks;
  }
  if (affectedMembers.length === 0 && opts?.memberNamesById?.size) {
    const all = [...opts.memberNamesById.values()];
    if (
      intervention.type === 'TEAM_COORDINATION' ||
      intervention.type === 'SAFETY_INTERVENTION' ||
      (intervention.type === 'DYNAMIC_REPLAN' &&
        (intervention.priority === 'CRITICAL' || intervention.priority === 'HIGH'))
    ) {
      affectedMembers = all;
    }
  }

  if (linked.length === 0) {
    return affectedMembers.length > 0 ? { ...intervention, affectedMembers } : intervention;
  }

  return {
    ...intervention,
    linkedRiskIds: linked.map((r) => r.id),
    linkedRiskKeys: linked.map((r) => r.riskKey),
    primaryRiskId: linked[0]?.id,
    affectedMembers,
  };
}

export function projectActiveRiskToIntervention(
  risk: ActiveRisk,
  tripId: string,
  actionDeadline?: string,
): ExecutionInterventionDto | null {
  if (
    risk.treatmentStatus !== 'ACTION_REQUIRED' &&
    risk.treatmentStatus !== 'DECISION_REQUIRED' &&
    risk.treatmentStatus !== 'APPLYING'
  ) {
    return null;
  }
  if (risk.decisionProblemIds.length > 0) {
    return null;
  }

  const type = resolveInterventionTypeFromRisk(risk);
  const priority = resolvePriorityFromRisk(risk, type);
  const recommendationId = risk.recommendationIds[0];
  const envSource = risk.sourceRefs.find((s) => s.sourceSystem === 'ENVIRONMENT_EVENT');
  const suggestedAction = recommendationId ? '查看并确认调整方案' : '查看风险详情';

  return {
    schemaId: EXECUTION_INTERVENTION_SCHEMA_ID,
    id: `intervention-risk-${risk.id}`,
    tripId,
    type,
    priority,
    title: risk.title,
    reason: risk.summary,
    affectedMembers: risk.affectedMembers.map((m) => m.label),
    affectedActivities: risk.affectedActivities.map((a) => a.label),
    recommendedAction: suggestedAction,
    alternativeActions: risk.recommendationIds.length > 1 ? risk.recommendationIds : undefined,
    actionDeadline: risk.actionDeadline ?? actionDeadline,
    evidenceRefs: risk.evidenceRefs.map((e) => e.id),
    requiresConfirmation: true,
    autoExecutable: false,
    reversible: true,
    modifiesEffectivePlan: type === 'DYNAMIC_REPLAN' || type === 'SAFETY_INTERVENTION',
    requiresRevalidation: type === 'DYNAMIC_REPLAN' || type === 'SAFETY_INTERVENTION',
    status: 'OPEN',
    decisionProblemId: undefined,
    linkedRiskIds: [risk.id],
    linkedRiskKeys: [risk.riskKey],
    primaryRiskId: risk.id,
    recommendationId,
    environmentEventId: envSource?.sourceId,
    actions: buildRiskInterventionActions(risk, type, recommendationId, actionDeadline),
    causalChain: buildRiskCausalChain(risk, suggestedAction),
  };
}

function resolveInterventionTypeFromRisk(risk: ActiveRisk): ExecutionInterventionType {
  if (risk.type === 'TEAM_COORDINATION') return 'TEAM_COORDINATION';
  if (risk.type === 'MEMBER_STATE' || risk.level === 'CRITICAL' || risk.executionGate === 'STOP') {
    return 'SAFETY_INTERVENTION';
  }
  if (risk.type === 'RESOURCE') return 'EXECUTION_PREPARATION';
  return 'DYNAMIC_REPLAN';
}

function resolvePriorityFromRisk(
  risk: ActiveRisk,
  type: ExecutionInterventionType,
): ExecutionInterventionPriority {
  if (risk.executionGate === 'STOP' || risk.level === 'CRITICAL') return 'CRITICAL';
  if (risk.level === 'HIGH' || risk.treatmentStatus === 'DECISION_REQUIRED') return 'HIGH';
  if (type === 'TEAM_COORDINATION') return 'MEDIUM';
  return 'MEDIUM';
}

export function buildRiskCausalChain(
  risk: ActiveRisk,
  suggestedAction: string,
): ExecutionInterventionCausalChainDto {
  const impactDesc =
    risk.affectedActivities.map((a) => a.label).join('、') ||
    risk.affectedLocations.map((l) => l.label).join('、') ||
    '当前行程';
  const worldFact = extractRiskWorldChangeFact(risk);

  return {
    headline: risk.title,
    assessment: risk.summary,
    nodes: [
      {
        nodeId: 'risk_detected',
        type: 'WORLD_CHANGE',
        title: '检测到执行风险',
        description: worldFact,
        sourceRefs: risk.evidenceRefs.map((e) => e.id),
      },
      {
        nodeId: 'impact',
        type: 'IMPACT',
        title: '影响范围',
        description: impactDesc,
      },
      {
        nodeId: 'conflict',
        type: 'CONFLICT',
        title: '决策冲突',
        description: '需要确认后再继续当前安排',
      },
      {
        nodeId: 'action',
        type: 'OPTION',
        title: '建议',
        description: suggestedAction,
      },
    ],
  };
}

function extractRiskWorldChangeFact(risk: ActiveRisk): string {
  const summary = risk.summary.trim();
  if (!summary) return risk.title;
  const firstClause = summary.split(/[；;。]/)[0]?.trim();
  if (firstClause && firstClause !== summary && firstClause.length >= 8) {
    return firstClause;
  }
  return firstClause || risk.title;
}

function buildRiskInterventionActions(
  risk: ActiveRisk,
  type: ExecutionInterventionType,
  recommendationId?: string,
  actionDeadline?: string,
): ExecutionInterventionActionsDto {
  const deferLabel = actionDeadline
    ? `稍后处理 · 最晚 ${formatDeadlineLabel(actionDeadline)} 前`
    : '稍后处理';

  if (type === 'SAFETY_INTERVENTION') {
    return {
      primary: {
        label: '查看建议',
        action: 'view_alternatives',
        enabled: Boolean(recommendationId),
        count: risk.recommendationIds.length,
      },
      secondary: {
        label: '确认已知晓',
        action: 'complete',
        enabled: true,
      },
      defer: { label: deferLabel, action: 'snooze', enabled: true },
    };
  }

  return {
    primary: {
      label: recommendationId ? '查看调整方案' : '查看风险详情',
      action: recommendationId ? 'view_alternatives' : 'view_impact',
      enabled: true,
      count: risk.recommendationIds.length || undefined,
    },
    secondary: {
      label: '确认已知晓',
      action: 'complete',
      enabled: true,
    },
    defer: { label: deferLabel, action: 'defer', enabled: true },
  };
}

function formatDeadlineLabel(isoOrTime: string): string {
  const d = new Date(isoOrTime);
  if (Number.isNaN(d.getTime())) return isoOrTime;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function dedupeInterventions(items: ExecutionInterventionDto[]): ExecutionInterventionDto[] {
  const byId = new Map<string, ExecutionInterventionDto>();
  for (const item of items) {
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      continue;
    }
    const mergedRiskIds = [
      ...new Set([...(existing.linkedRiskIds ?? []), ...(item.linkedRiskIds ?? [])]),
    ];
    byId.set(item.id, {
      ...existing,
      linkedRiskIds: mergedRiskIds,
      linkedRiskKeys: [
        ...new Set([...(existing.linkedRiskKeys ?? []), ...(item.linkedRiskKeys ?? [])]),
      ],
      primaryRiskId: existing.primaryRiskId ?? item.primaryRiskId,
    });
  }
  return [...byId.values()];
}
