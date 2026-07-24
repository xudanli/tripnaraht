import type {
  PlanProposal,
  PlanProposalChange,
  PlanningIntent,
} from '../types/plan-proposal.types';
import type {
  PlanningCounterfactualRow,
  PlanningDecisionCluster,
  PlanningDecisionOption,
  PlanningDecisionOptionKind,
  PlanningDecisionPack,
  PlanningDiagnostic,
  PlanningImpactScope,
} from '../types/planning-decision-pack.types';
import { enrichDecisionPackSolutionCards } from './plan-option-solution-card.util';

const CLUSTER_DEFS: Array<{
  id: string;
  title: string;
  codes: Set<string>;
  dependsOn: string[];
  priority: PlanningDecisionCluster['priority'];
}> = [
  {
    id: 'schedule_conflicts',
    title: '日程冲突',
    codes: new Set(['overlap_time', 'duplicate_place', 'invalid_time_window', 'locked_item']),
    dependsOn: [],
    priority: 'high',
  },
  {
    id: 'pacing_timing',
    title: '节奏与时段',
    codes: new Set(['late_end_time', 'drive_excess', 'intensity_high']),
    dependsOn: ['schedule_conflicts'],
    priority: 'medium',
  },
  {
    id: 'candidate_placement',
    title: '候选与路线',
    codes: new Set(['high_detour', 'gap_underfill', 'must_go_unplaced', 'candidate_pool_large']),
    dependsOn: [],
    priority: 'medium',
  },
  {
    id: 'structure_integrity',
    title: '结构完整性',
    codes: new Set(['invalid_day', 'empty_day']),
    dependsOn: [],
    priority: 'low',
  },
  {
    id: 'plan_freshness',
    title: '方案时效',
    codes: new Set(['context_stale']),
    dependsOn: ['schedule_conflicts', 'candidate_placement'],
    priority: 'high',
  },
];

function resolveOptionKind(intent: PlanningIntent, change?: PlanProposalChange): PlanningDecisionOptionKind {
  if (intent === 'REDUCE_INTENSITY') return 'SHORTEN_STAY';
  if (intent === 'MOVE_ITEM' && change?.from && change?.to) {
    const fromMin = parseHHmm(change.from);
    const toMin = parseHHmm(change.to);
    if (toMin < fromMin) return 'SHIFT_EARLIER';
    if (toMin > fromMin) return 'SHIFT_LATER';
  }
  if (intent === 'FILL_GAP' || intent === 'PLACE_CANDIDATE' || intent === 'ADD_ITEM') {
    return 'SHIFT_LATER';
  }
  return 'ACCEPT_RISK';
}

function parseHHmm(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function buildImpactScope(changes: PlanProposalChange[]): PlanningImpactScope {
  const affectedDays = [...new Set(changes.map((c) => c.dayIndex))].sort((a, b) => a - b);
  const scope: PlanningImpactScope['scope'] =
    affectedDays.length > 1 ? 'TRIP' : changes.some((c) => c.candidateId) ? 'CANDIDATE_POOL' : 'DAY';

  return {
    scope,
    affectedDays,
    itemIds: [...new Set(changes.map((c) => c.itemId).filter(Boolean) as string[])],
    candidateIds: [...new Set(changes.map((c) => c.candidateId).filter(Boolean) as string[])],
    placeIds: [...new Set(changes.map((c) => c.placeId).filter((id): id is number => id != null))],
  };
}

function buildCounterfactualRows(proposal: PlanProposal): PlanningCounterfactualRow[] {
  return proposal.diff.timelineChanges.map((row, idx) => ({
    id: `cf_${idx}`,
    label: row.label,
    dayIndex: row.dayIndex,
    before: row.from ?? '（当前行程）',
    after: row.to ?? row.label,
  }));
}

function diagnosticsFromProposal(proposal: PlanProposal): PlanningDiagnostic[] {
  const diagnostics: PlanningDiagnostic[] = [];
  let seq = 0;

  const push = (
    code: string,
    message: string,
    severity: PlanningDiagnostic['severity'],
    clusterId: string,
    dayIndex?: number,
  ) => {
    diagnostics.push({
      id: `diag_${seq += 1}`,
      code,
      message,
      severity,
      dayIndex,
      clusterId,
    });
  };

  for (const c of proposal.validation.conflicts) {
    const code =
      c.kind === 'duplicate_item'
        ? 'duplicate_place'
        : c.kind === 'invalid_time_window'
          ? 'invalid_time_window'
          : c.kind === 'invalid_day'
            ? 'invalid_day'
            : 'overlap_time';
    push(code, c.message, 'block', 'schedule_conflicts', c.dayIndex);
  }

  for (const w of proposal.validation.warnings) {
    if (/重叠|overlap/i.test(w)) {
      push('overlap_time', w, 'warn', 'schedule_conflicts');
    } else if (/偏晚|21|22/i.test(w)) {
      push('late_end_time', w, 'warn', 'pacing_timing');
    } else if (/绕路|驾驶|detour/i.test(w)) {
      push('high_detour', w, 'warn', 'candidate_placement');
    } else if (/体力|强度/i.test(w)) {
      push('intensity_high', w, 'warn', 'pacing_timing');
    } else {
      push('gap_underfill', w, 'info', 'candidate_placement');
    }
  }

  for (const t of proposal.tradeoffs) {
    if (/驾驶|drive|分钟/i.test(t)) {
      push('drive_excess', t, 'warn', 'pacing_timing');
    } else if (/必去|must/i.test(t)) {
      push('must_go_unplaced', t, 'info', 'candidate_placement');
    }
  }

  if (proposal.status === 'STALE') {
    push('context_stale', '行程上下文已变化，草案需重新生成', 'block', 'plan_freshness');
  }

  while (diagnostics.length < 14 && proposal.changes.length > diagnostics.length) {
    const change = proposal.changes[diagnostics.length % proposal.changes.length]!;
    push(
      'gap_underfill',
      `变更：${change.label ?? change.operation}（第 ${change.dayIndex} 天）`,
      'info',
      'candidate_placement',
      change.dayIndex,
    );
  }

  return diagnostics.slice(0, 14);
}

function buildPrimaryOption(proposal: PlanProposal): PlanningDecisionOption {
  const primaryChange = proposal.changes.find((c) => c.operation === 'ADD' || c.operation === 'MOVE');
  const impactScope = buildImpactScope(proposal.changes);

  return {
    id: `${proposal.proposalId}_primary`,
    optionKind: resolveOptionKind(proposal.intent, primaryChange),
    title: proposal.diff.summary || '应用当前草案',
    recommended: proposal.validation.status !== 'BLOCK',
    outcomes: [
      proposal.diff.summary,
      ...(proposal.benefits?.gapsFilled
        ? [`填补 ${proposal.benefits.gapsFilled} 处空档`]
        : []),
      ...(proposal.benefits?.itemsAdded ? [`新增 ${proposal.benefits.itemsAdded} 个活动`] : []),
    ].filter(Boolean),
    costs: proposal.tradeoffs.length > 0 ? proposal.tradeoffs : ['可能调整相邻时段与驾驶顺序'],
    impactScope,
    counterfactualRows: buildCounterfactualRows(proposal),
    action: {
      type: 'apply_proposal',
      proposalId: proposal.proposalId,
    },
  };
}

function buildAcceptRiskOption(proposal: PlanProposal): PlanningDecisionOption | null {
  if (proposal.validation.status !== 'WARN') return null;

  return {
    id: `${proposal.proposalId}_accept_risk`,
    optionKind: 'ACCEPT_RISK',
    title: '接受重叠风险并写入',
    outcomes: ['保留当前时段安排', '尽快在行程中手动微调相邻项'],
    costs: proposal.validation.warnings,
    impactScope: buildImpactScope(proposal.changes),
    counterfactualRows: buildCounterfactualRows(proposal),
    action: {
      type: 'apply_proposal',
      proposalId: proposal.proposalId,
      payload: { force: true },
    },
  };
}

function buildDiscardOption(proposal: PlanProposal): PlanningDecisionOption {
  return {
    id: `${proposal.proposalId}_discard`,
    optionKind: 'ACCEPT_RISK',
    title: '放弃草案，保持现状',
    recommended: proposal.validation.status === 'BLOCK',
    outcomes: ['正式行程不变', '可重新生成其他方案'],
    costs: ['当前问题仍未解决'],
    impactScope: {
      scope: 'TRIP',
      affectedDays: [],
      itemIds: [],
      candidateIds: [],
      placeIds: [],
    },
    counterfactualRows: proposal.diff.timelineChanges.map((row, idx) => ({
      id: `cf_keep_${idx}`,
      label: row.label,
      dayIndex: row.dayIndex,
      before: row.to ?? row.label,
      after: row.from ?? '（保持不变）',
    })),
    action: {
      type: 'discard_proposal',
      proposalId: proposal.proposalId,
    },
  };
}

function clusterDiagnostics(diagnostics: PlanningDiagnostic[]): PlanningDecisionCluster[] {
  const clusters: PlanningDecisionCluster[] = [];

  for (const def of CLUSTER_DEFS) {
    const matched = diagnostics.filter((d) => def.codes.has(d.code));
    if (matched.length === 0) continue;

    clusters.push({
      id: def.id,
      title: def.title,
      summary: `${matched.length} 项诊断`,
      diagnosticCount: matched.length,
      diagnostics: matched,
      decisionId: `decision_${def.id}`,
      dependsOn: def.dependsOn.filter((dep) =>
        CLUSTER_DEFS.some((c) => c.id === dep && diagnostics.some((d) => c.codes.has(d.code))),
      ),
      resolvesCount: matched.filter((d) => d.severity !== 'info').length || matched.length,
      options: [],
      priority: def.priority,
    });
  }

  return clusters.slice(0, 5);
}

export function buildPlanningDecisionPack(
  proposal: PlanProposal,
  baseUrl = '/api',
): PlanningDecisionPack {
  const diagnostics = diagnosticsFromProposal(proposal);
  const options = [
    buildPrimaryOption(proposal),
    buildAcceptRiskOption(proposal),
    buildDiscardOption(proposal),
  ].filter((o): o is PlanningDecisionOption => o != null);

  const decisionClusters = clusterDiagnostics(diagnostics);
  for (const cluster of decisionClusters) {
    cluster.options = options.filter((opt) => {
      if (cluster.id === 'schedule_conflicts') {
        return opt.optionKind !== 'ACCEPT_RISK' || opt.id.endsWith('_accept_risk');
      }
      if (cluster.id === 'plan_freshness') {
        return opt.action?.type === 'discard_proposal';
      }
      return true;
    });
    if (cluster.options.length === 0) {
      cluster.options = [options[0]!];
    }
  }

  const monitorWebhookUrl = `${baseUrl}/trips/${proposal.tripId}/arrange-itinerary/proposals/${proposal.proposalId}/monitor`;

  return enrichDecisionPackSolutionCards(
    {
      schema: 'tripnara.planning_decision_pack@v1',
      tripId: proposal.tripId,
      proposalId: proposal.proposalId,
      generatedAt: new Date().toISOString(),
      options,
      decisionClusters,
      diagnostics,
      monitor: {
        validUntil: proposal.expiresAt,
        contextVersion: proposal.contextVersion,
        monitorWebhookUrl,
        pollIntervalMs: 15_000,
      },
    },
    proposal,
  );
}

export function buildExecutionSteps(proposal: PlanProposal): import('../types/planning-decision-pack.types').PlanningExecutionStep[] {
  const actionable = proposal.changes.filter(
    (c) => c.operation === 'ADD' || c.operation === 'MOVE' || c.operation === 'REMOVE_CANDIDATE',
  );

  return actionable.map((change, idx) => ({
    id: `step_${idx + 1}`,
    order: idx + 1,
    label:
      change.operation === 'ADD'
        ? `新增：${change.label ?? '活动'}`
        : change.operation === 'MOVE'
          ? `移动：${change.label ?? change.itemId}`
          : `移除候选：${change.label ?? change.candidateId}`,
    status: 'done' as const,
    changeOperation: change.operation,
    itemId: change.itemId,
    candidateId: change.candidateId,
    completedAt: new Date().toISOString(),
  }));
}
