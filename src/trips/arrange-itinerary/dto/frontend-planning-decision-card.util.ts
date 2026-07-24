/**
 * 规划决策卡片 UI 辅助 — 供前端 PlanProposalDecisionSheet / CopilotRail 使用
 */
import type {
  PlanningDecisionCluster,
  PlanningDecisionOption,
  PlanningDecisionPack,
  PlanningExecutionStep,
  PlanningProposalValidityView,
} from './frontend-planning-decision-pack.types';

export const OPTION_KIND_LABELS: Record<PlanningDecisionOption['optionKind'], string> = {
  SHIFT_EARLIER: '提前',
  SHORTEN_STAY: '缩短停留',
  SHIFT_LATER: '延后',
  ACCEPT_RISK: '接受风险',
};

/** 方案卡数据依据 icon 映射（前端图标库 key） */
export const DATA_BASIS_ICON_KEYS: Record<
  NonNullable<PlanningDecisionOption['dataBasis']>[number]['icon'],
  string
> = {
  calendar: 'calendar',
  route: 'route',
  weather: 'cloud-sun',
  traffic: 'traffic',
  history: 'history',
  sensor: 'radar',
};

export function getOptionDisplayTitle(option: PlanningDecisionOption): string {
  return option.headline?.trim() || option.title;
}

export function getRecommendedOption(
  pack?: PlanningDecisionPack | null,
): PlanningDecisionOption | undefined {
  if (!pack?.options?.length) return undefined;
  return pack.options.find((o) => o.recommended) ?? pack.options[0];
}

export function sortClustersByDependency(
  clusters: PlanningDecisionCluster[],
): PlanningDecisionCluster[] {
  const byId = new Map(clusters.map((c) => [c.id, c]));
  const visited = new Set<string>();
  const result: PlanningDecisionCluster[] = [];

  const visit = (cluster: PlanningDecisionCluster) => {
    if (visited.has(cluster.id)) return;
    for (const dep of cluster.dependsOn) {
      const parent = byId.get(dep);
      if (parent) visit(parent);
    }
    visited.add(cluster.id);
    result.push(cluster);
  };

  for (const cluster of clusters) visit(cluster);
  return result;
}

export function isProposalMutation(response: {
  mode: string;
  proposal?: { decisionPack?: PlanningDecisionPack };
}): boolean {
  return response.mode === 'proposal' && Boolean(response.proposal);
}

export function extractDecisionPack(response: {
  proposal?: { decisionPack?: PlanningDecisionPack };
}): PlanningDecisionPack | undefined {
  return response.proposal?.decisionPack;
}

export function shouldPollMonitor(validity: PlanningProposalValidityView): boolean {
  return !validity.isStale && new Date(validity.validUntil).getTime() > Date.now();
}

export function buildApplyBodyFromOption(
  option: PlanningDecisionOption,
  contextVersion?: number,
): { contextVersion?: number; force?: boolean } {
  const force = option.action?.payload?.force === true;
  return { contextVersion, ...(force ? { force: true } : {}) };
}

export function summarizeImpactScope(option: PlanningDecisionOption): string {
  const { impactScope } = option;
  const parts: string[] = [];
  if (impactScope.affectedDays.length) {
    parts.push(`第 ${impactScope.affectedDays.join('、')} 天`);
  }
  if (impactScope.candidateIds.length) {
    parts.push(`${impactScope.candidateIds.length} 个候选`);
  }
  if (impactScope.itemIds.length) {
    parts.push(`${impactScope.itemIds.length} 个行程项`);
  }
  return parts.length ? parts.join(' · ') : impactScope.scope;
}

/** 写回后步骤条数据 */
export function executionStepsFromApply(result: {
  executionSteps?: PlanningExecutionStep[];
}): PlanningExecutionStep[] {
  return result.executionSteps ?? [];
}
