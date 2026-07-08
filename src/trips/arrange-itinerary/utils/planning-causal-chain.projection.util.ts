import type { CascadeImpact } from '../../../itinerary-items/interfaces/validation.interface';
import type { DecisionCheckerCascadeNodeDto } from '../../trip-constraint-solver/types/decision-checker.types';
import type { ReadinessCascadeUiHint } from '../../readiness/types/coverage-map.types';
import type {
  PlanProposal,
  PlanProposalChange,
} from '../types/plan-proposal.types';
import type { UnifiedDecisionActionPreviewView } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import type { IcelandSelfDriveCausalOutput } from '../../causal-runtime/domains/iceland-self-drive-causal.types';
import type {
  PlanningCausalChainBasisSource,
  PlanningCausalChainNode,
  PlanningCausalChainNodeSeverity,
  PlanningCausalChainNodeSource,
  PlanningDecisionCausalChain,
} from '../types/planning-causal-chain.types';
import { buildInspectorPlanDiffFromPreview } from './planning-decision-inspector.projection.util';

function riskLevelToSeverity(risk: string): PlanningCausalChainNodeSeverity {
  if (risk === 'LOW') return 'info';
  if (risk === 'MEDIUM') return 'warn';
  return 'risk';
}

function dcStatusToSeverity(status: DecisionCheckerCascadeNodeDto['status']): PlanningCausalChainNodeSeverity {
  if (status === 'ok') return 'info';
  if (status === 'at_risk') return 'warn';
  return 'risk';
}

function reindexNodes(nodes: PlanningCausalChainNode[]): PlanningCausalChainNode[] {
  return nodes.map((node, index) => ({ ...node, order: index }));
}

function pushNode(
  nodes: PlanningCausalChainNode[],
  partial: Omit<PlanningCausalChainNode, 'id' | 'order'>,
): void {
  nodes.push({
    id: `node_${nodes.length + 1}`,
    order: nodes.length,
    ...partial,
  });
}

export function projectCausalChainFromReadinessHints(
  hints: ReadinessCascadeUiHint[],
  triggerDescription?: string,
): PlanningCausalChainNode[] {
  const nodes: PlanningCausalChainNode[] = [];

  if (triggerDescription?.trim()) {
    pushNode(nodes, {
      severity: 'info',
      description: triggerDescription.trim(),
      title: '根因',
      source: 'readiness',
    });
  }

  for (const hint of hints) {
    const description = hint.message?.trim() || hint.recommendation?.trim();
    if (!description) continue;
    pushNode(nodes, {
      severity: riskLevelToSeverity(hint.riskLevel),
      description,
      title: hint.entityLabel?.trim() || undefined,
      entityLabel: hint.entityLabel,
      source: 'readiness',
      propagationHop: hint.propagationHop,
      netImpactMinutes: hint.netImpactMinutes,
    });
  }

  return nodes;
}

export function projectCausalChainFromDecisionChecker(
  cascade: DecisionCheckerCascadeNodeDto[],
): PlanningCausalChainNode[] {
  return [...cascade]
    .sort((a, b) => a.order - b.order)
    .map((node, index) => ({
      id: node.id || `dc_${index}`,
      order: index,
      severity: dcStatusToSeverity(node.status),
      description: node.description?.trim() || node.title,
      title: node.title,
      source: 'decision_checker' as PlanningCausalChainNodeSource,
    }));
}

export interface ProposalCascadeSimulation {
  change: PlanProposalChange;
  travelShortfallMinutes?: number;
  travelWarning?: string;
  bufferConsumed?: boolean;
  cascade?: CascadeImpact;
}

export function projectCausalChainFromProposalSimulation(
  proposal: PlanProposal,
  simulations: ProposalCascadeSimulation[],
): PlanningCausalChainNode[] {
  const nodes: PlanningCausalChainNode[] = [];

  for (const sim of simulations) {
    const { change, cascade, travelShortfallMinutes, travelWarning, bufferConsumed } = sim;

    if (travelWarning || travelShortfallMinutes) {
      const minutes = travelShortfallMinutes ?? 0;
      pushNode(nodes, {
        severity: 'info',
        description:
          travelWarning?.trim() ||
          (minutes > 0
            ? `道路预计耗时增加 ${minutes} 分钟（当前路段受交通与天气影响）`
            : '路段通行时间增加'),
        title: '通行延误',
        dayIndex: change.dayIndex,
        source: 'validation',
        netImpactMinutes: minutes > 0 ? minutes : undefined,
      });
    }

    if (bufferConsumed || (travelShortfallMinutes && travelShortfallMinutes > 0)) {
      pushNode(nodes, {
        severity: 'info',
        description: '原计划交通缓冲被消耗',
        dayIndex: change.dayIndex,
        source: 'validation',
      });
    }

    if (change.operation === 'MOVE' && change.label && change.to && change.from !== change.to) {
      const delayMatch = cascade?.affectedItems?.[0]?.delayMinutes;
      if (!cascade?.affectedItems?.length) {
        pushNode(nodes, {
          severity: 'warn',
          description: `${change.label}到达时间延后`,
          title: change.label,
          entityLabel: change.label,
          itemId: change.itemId,
          dayIndex: change.dayIndex,
          source: 'proposal',
          netImpactMinutes: delayMatch,
        });
      }
    }

    for (const affected of cascade?.affectedItems ?? []) {
      pushNode(nodes, {
        severity: affected.delayMinutes >= 30 ? 'risk' : 'warn',
        description: `「${affected.name}」到达时间延后${affected.timeDelta ? ` ${affected.timeDelta}` : ''}`,
        title: affected.name,
        entityLabel: affected.name,
        itemId: affected.id,
        dayIndex: change.dayIndex,
        source: 'validation',
        netImpactMinutes: affected.delayMinutes,
      });
    }

    const lunchMargin = detectLunchMarginRisk(proposal, cascade);
    if (lunchMargin) {
      pushNode(nodes, {
        severity: 'risk',
        description: lunchMargin,
        dayIndex: change.dayIndex,
        source: 'validation',
      });
    }
  }

  if (!nodes.length) {
    for (const row of proposal.diff.timelineChanges) {
      if (row.impact === 'low') continue;
      pushNode(nodes, {
        severity: row.impact === 'high' ? 'risk' : 'warn',
        description: row.to
          ? `${row.label}：${row.from ?? '当前'} → ${row.to}`
          : row.label,
        title: row.label,
        dayIndex: row.dayIndex,
        source: 'proposal',
      });
    }
  }

  const downstreamRisk = buildDownstreamChainRisk(nodes, simulations);
  if (downstreamRisk) {
    pushNode(nodes, {
      severity: 'risk',
      description: downstreamRisk,
      source: 'validation',
    });
  }

  return nodes;
}

function detectLunchMarginRisk(
  proposal: PlanProposal,
  cascade?: CascadeImpact,
): string | undefined {
  const lunchTradeoff = proposal.tradeoffs.find((t) => /午餐|午饭|用餐/i.test(t));
  if (lunchTradeoff) return '午餐前可用余量下降';

  const maxDelay = Math.max(0, ...(cascade?.affectedItems?.map((i) => i.delayMinutes) ?? []));
  if (maxDelay >= 20) return '午餐前可用余量下降';
  return undefined;
}

function buildDownstreamChainRisk(
  nodes: PlanningCausalChainNode[],
  simulations: ProposalCascadeSimulation[],
): string | undefined {
  const totalAffected = simulations.reduce(
    (sum, s) => sum + (s.cascade?.affectedCount ?? 0),
    0,
  );
  const hasRiskNodes = nodes.some((n) => n.severity === 'risk');
  if (totalAffected >= 2 || hasRiskNodes) {
    return '当天后续安排存在连锁延误风险';
  }
  if (totalAffected === 1) {
    return '当天后续安排存在连锁延误风险';
  }
  return undefined;
}

export function mergeCausalChainNodes(
  ...sources: PlanningCausalChainNode[][]
): PlanningCausalChainNode[] {
  const seen = new Set<string>();
  const merged: PlanningCausalChainNode[] = [];

  for (const list of sources) {
    for (const node of list) {
      const key = `${node.source}:${node.description}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ ...node, id: `node_${merged.length + 1}`, order: merged.length });
    }
  }

  return reindexNodes(merged);
}

export function resolveBasisSource(
  parts: Array<{ source: PlanningCausalChainNodeSource | 'problem_assertion'; count: number }>,
): PlanningCausalChainBasisSource {
  const active = parts.filter((p) => p.count > 0);
  if (!active.length) return 'empty';
  if (active.length === 1) {
    const only = active[0].source;
    if (only === 'readiness') return 'readiness_cascade';
    if (only === 'world_context') return 'world_context';
    if (only === 'decision_checker' || only === 'problem_assertion') return 'decision_checker';
    return 'proposal_diff';
  }
  return 'mixed';
}

function enforcementToSeverity(
  enforcement?: string,
): PlanningCausalChainNodeSeverity {
  if (enforcement === 'BLOCK' || enforcement === 'REQUIRE_ADJUSTMENT') return 'risk';
  if (enforcement === 'REQUIRE_CONFIRMATION' || enforcement === 'WARN') return 'warn';
  return 'info';
}

function reliabilityToSeverity(
  reliability?: string,
): PlanningCausalChainNodeSeverity {
  if (reliability === 'high') return 'info';
  if (reliability === 'medium') return 'warn';
  return 'risk';
}

const DOMAIN_ROOT_TITLE: Record<string, string> = {
  TIME: '时间约束',
  TRANSPORT: '交通约束',
  SCHEDULE: '日程约束',
  MEAL: '用餐约束',
};

/** Iceland 因果世界模型 → 竖链节点（P1 信号注入，非整模型） */
export function projectCausalChainFromIcelandAssessment(
  assessment: IcelandSelfDriveCausalOutput,
): PlanningCausalChainNode[] {
  const nodes: PlanningCausalChainNode[] = [];
  const missHigh = assessment.missProbability >= 0.35;

  for (const [index, step] of assessment.causalChain.entries()) {
    const text = step?.trim();
    if (!text) continue;
    pushNode(nodes, {
      severity: index === 0 ? 'info' : missHigh ? 'warn' : 'info',
      description: text,
      title: index === 0 ? '环境因素' : '传播',
      source: 'world_context',
      propagationHop: index + 1,
    });
  }

  const narrative = assessment.userFacingAssessment?.trim();
  if (narrative && !nodes.some((n) => n.description === narrative)) {
    pushNode(nodes, {
      severity: missHigh ? 'risk' : assessment.missProbability >= 0.15 ? 'warn' : 'info',
      description: narrative,
      title: '因果评估',
      source: 'world_context',
      netImpactMinutes: Math.max(
        0,
        assessment.travelTime.p90Minutes - assessment.travelTime.pointMinutes,
      ),
    });
  }

  return nodes;
}

/** 决策问题 assertions[] → 有序竖链（根因 → 证据 → 结论 → 下游风险） */
export function projectCausalChainFromProblemAssertions(
  assertions: Array<{
    domain?: string;
    enforcement?: string;
    condition?: string;
    conclusion?: string;
    proofs?: Array<{
      entity?: string;
      currentFact?: string;
      conclusion?: string;
      ruleId?: string;
      evidenceType?: string;
    }>;
  }>,
): PlanningCausalChainNode[] {
  const nodes: PlanningCausalChainNode[] = [];

  for (const assertion of assertions) {
    const condition = assertion.condition?.trim();
    const conclusion = assertion.conclusion?.trim();
    const domainTitle =
      (assertion.domain && DOMAIN_ROOT_TITLE[assertion.domain]) ||
      assertion.domain ||
      '约束触发';
    const rootSeverity = enforcementToSeverity(assertion.enforcement);

    if (condition) {
      pushNode(nodes, {
        severity: rootSeverity,
        description: condition,
        title: '根因',
        entityLabel: domainTitle,
        source: 'problem_assertion',
      });
    } else if (conclusion) {
      pushNode(nodes, {
        severity: rootSeverity,
        description: conclusion,
        title: '根因',
        entityLabel: domainTitle,
        source: 'problem_assertion',
      });
    }

    for (const [hop, proof] of (assertion.proofs ?? []).entries()) {
      const fact = proof.currentFact?.trim();
      const desc =
        fact ||
        proof.conclusion?.trim() ||
        proof.ruleId?.trim();
      if (!desc) continue;
      if (condition && desc === condition) continue;
      pushNode(nodes, {
        severity: 'info',
        description: desc,
        title: proof.entity?.trim() || proof.evidenceType?.trim() || '传播',
        entityLabel: proof.entity?.trim(),
        source: 'problem_assertion',
        propagationHop: hop + 1,
      });
    }

    if (conclusion && conclusion !== condition) {
      pushNode(nodes, {
        severity: rootSeverity,
        description: conclusion,
        title: '约束结论',
        source: 'problem_assertion',
      });
    }

    if (
      assertion.enforcement === 'BLOCK' ||
      assertion.enforcement === 'REQUIRE_ADJUSTMENT'
    ) {
      pushNode(nodes, {
        severity: 'risk',
        description: '若不调整，当日后续安排可能受影响',
        title: '连锁风险',
        source: 'problem_assertion',
      });
    }
  }

  return nodes;
}

/** 决策空间 — 从 option preview 投影修复后的传播链 */
export function projectCausalChainFromOptionPreview(
  preview: UnifiedDecisionActionPreviewView,
): PlanningCausalChainNode[] {
  const planDiff = buildInspectorPlanDiffFromPreview(preview);
  const nodes: PlanningCausalChainNode[] = [];

  pushNode(nodes, {
    severity: 'info',
    description: planDiff.optionTitle ?? preview.action.title,
    title: '选用方案',
    source: 'option_preview',
  });

  for (const row of planDiff.changeRows) {
    if (row.id === 'chg_preview_summary') continue;
    const delta = row.deltaMinutes;
    const severity: PlanningCausalChainNodeSeverity =
      delta != null && delta > 30 ? 'risk' : delta != null && delta > 0 ? 'warn' : 'info';
    const timePart =
      row.deltaLabel !== '—' ? `（${row.deltaLabel}）` : '';
    pushNode(nodes, {
      severity,
      description:
        row.before && row.after
          ? `${row.itemLabel}：${row.before} → ${row.after}${timePart}`
          : row.itemLabel,
      title: row.itemLabel,
      entityLabel: row.itemLabel,
      source: 'option_preview',
      netImpactMinutes: delta,
    });
  }

  const hasDelay = planDiff.changeRows.some((r) => (r.deltaMinutes ?? 0) > 0);
  const hasImprovement = planDiff.changeRows.some((r) => (r.deltaMinutes ?? 0) < 0);
  if (hasDelay) {
    pushNode(nodes, {
      severity: 'warn',
      description: '方案执行后，后续活动时间可能产生连锁调整',
      title: '传播影响',
      source: 'option_preview',
    });
  } else if (hasImprovement || planDiff.changeRows.length > 1) {
    pushNode(nodes, {
      severity: 'info',
      description: '方案可缓解当前约束冲突',
      title: '预期效果',
      source: 'option_preview',
    });
  }

  return nodes;
}

/** decision-checker.evidence.items → 因果链节点（cascade 为空时的兜底） */
export function projectCausalChainFromDecisionCheckerEvidence(
  items: Array<{
    id: string;
    title: string;
    subtitle?: string;
    reliability?: string;
  }>,
): PlanningCausalChainNode[] {
  return items.map((item, index) => ({
    id: item.id || `ev_${index + 1}`,
    order: index,
    severity: reliabilityToSeverity(item.reliability),
    description: item.subtitle?.trim() || item.title,
    title: item.title,
    source: 'decision_checker' as PlanningCausalChainNodeSource,
  }));
}

export function filterDecisionCheckerEvidenceForProblem<
  T extends { id: string; title: string; subtitle?: string; refs?: Array<{ type: string; id: string }> },
>(items: T[], problemId: string): T[] {
  const slug = problemId.includes(':') ? problemId.split(':').slice(1).join(':') : problemId;
  const matched = items.filter(
    (item) =>
      item.id.includes(slug) ||
      item.refs?.some((ref) => ref.id?.includes(slug) || slug.includes(ref.id ?? '')),
  );
  if (matched.length > 0) return matched;
  return items.filter((item) => item.title !== '全行程证据覆盖');
}

export function buildPlanningDecisionCausalChain(input: {
  tripId: string;
  proposalId?: string;
  problemId?: string;
  optionId?: string;
  nodes: PlanningCausalChainNode[];
  basisSource: PlanningCausalChainBasisSource;
  basisUpdatedAt?: string;
}): PlanningDecisionCausalChain {
  const params = new URLSearchParams();
  if (input.proposalId) params.set('proposalId', input.proposalId);
  if (input.problemId) params.set('problemId', input.problemId);
  if (input.optionId) params.set('optionId', input.optionId);
  const query = params.toString();
  const refreshUrl = query
    ? `/api/trips/${input.tripId}/arrange-itinerary/decision-causal-chain?${query}`
    : `/api/trips/${input.tripId}/arrange-itinerary/decision-causal-chain`;

  return {
    schema: 'tripnara.planning_causal_chain@v1',
    tripId: input.tripId,
    proposalId: input.proposalId,
    problemId: input.problemId,
    optionId: input.optionId,
    generatedAt: new Date().toISOString(),
    basisUpdatedAt: input.basisUpdatedAt,
    basisSource: input.basisSource,
    refreshUrl,
    nodes: reindexNodes(input.nodes),
  };
}
