/**
 * 从 decision_log、optimizationHints、TimeDrift 投影提取因果链（纯函数）。
 */

import type { OptimizationHints } from '../../../decision/kernel/decision-state.types';
import type { OptimizationDecisionVerdict } from '../../../decision/kernel/decision-verdict.util';
import { buildDecisionVerdictFromHints } from '../../../decision/kernel/decision-verdict.util';
import type { DecisionLogEntry } from '../shared/decision-result.types';
import type { TimeDrift } from '../temporal/time-drift.types';
import {
  CAUSAL_CHAIN_SCHEMA_V1,
  type CausalChain,
  type CausalChainNode,
  type CausalNodeKind,
} from './causal-chain.types';
import { buildDegradationHeadlineZh } from './format-degradation-narrative.util';

function pushNode(
  nodes: CausalChainNode[],
  partial: Omit<CausalChainNode, 'id' | 'order'>,
): void {
  nodes.push({
    id: `causal_${nodes.length + 1}`,
    order: nodes.length,
    ...partial,
  });
}

function kindFromLog(log: DecisionLogEntry): CausalNodeKind | undefined {
  if (log.decisionStage === 'DEM_EVIDENCE' || log.reasonCodes?.some((c) => c.includes('DEM'))) {
    return 'DEM_HARD_GATE';
  }
  if (log.persona === 'NEPTUNE' && (log.action === 'REPLACE' || log.action === 'ADJUST')) {
    return 'PERSONA_REPAIR';
  }
  if (log.decisionStage === 'PACE_ADJUST' || log.persona === 'DR_DRE') {
    return 'SCHEDULE_ADJUSTMENT';
  }
  if (log.reasonCodes?.some((c) => /ROAD|F_ROAD|CLOSED/i.test(c))) {
    return 'ROAD_CLOSURE';
  }
  if (log.reasonCodes?.some((c) => /WIND|WEATHER|STORM/i.test(c))) {
    return 'WEATHER_PERTURBATION';
  }
  return undefined;
}

function driftToNode(drift: TimeDrift): CausalChainNode {
  return {
    id: `drift_${drift.id}`,
    order: 0,
    kind: 'TIME_DRIFT',
    facts: {
      deltaMinutes: drift.deltaMinutes,
      sourceSlotId: drift.sourceSlotId,
      causeKind: drift.cause.kind,
    },
    sourceRef: drift.narrative ?? drift.cause.kind,
  };
}

export interface ExtractCausalChainInput {
  decisionLogs?: DecisionLogEntry[];
  optimizationHints?: OptimizationHints;
  timeDrifts?: TimeDrift[];
  partyNoteZh?: string;
}

export function extractCausalChain(input: ExtractCausalChainInput): CausalChain | undefined {
  const logs = input.decisionLogs ?? [];
  const hints = input.optimizationHints;
  const verdict: OptimizationDecisionVerdict | undefined =
    hints?.decisionVerdict ?? (hints ? buildDecisionVerdictFromHints(hints) : undefined);

  const nodes: CausalChainNode[] = [];

  for (const drift of input.timeDrifts ?? []) {
    const n = driftToNode(drift);
    n.order = nodes.length;
    nodes.push(n);
  }

  for (const log of logs) {
    const kind = kindFromLog(log);
    if (!kind) continue;
    if (log.action === 'EVALUATE' && kind !== 'DEM_HARD_GATE') continue;

    pushNode(nodes, {
      kind,
      persona: log.persona,
      facts: {
        action: log.action,
        stage: log.decisionStage,
        source: log.decisionSource,
      },
      sourceRef: log.explanation?.slice(0, 240),
    });
  }

  const mc = verdict?.monte_carlo_summary;
  if (mc?.used && mc.total_samples) {
    pushNode(nodes, {
      kind: 'MONTE_CARLO_OUTCOME',
      facts: {
        totalSamples: mc.total_samples,
        chosenPlanId: verdict?.chosen_plan_id ?? '',
      },
      sourceRef: 'monte_carlo_summary',
    });
  }

  for (const rejected of verdict?.rejected_plans?.slice(0, 3) ?? []) {
    pushNode(nodes, {
      kind: rejected.status === 'infeasible' ? 'ROAD_CLOSURE' : 'MONTE_CARLO_OUTCOME',
      facts: {
        planId: rejected.id,
        status: rejected.status,
        hardViolations: rejected.hard_violation_count ?? 0,
      },
      sourceRef: (rejected.rejection_reasons ?? []).join('; ').slice(0, 200),
    });
  }

  const degradationHeadline = hints ? buildDegradationHeadlineZh(hints) : undefined;
  if (degradationHeadline) {
    pushNode(nodes, {
      kind: 'SYSTEM_DEGRADATION',
      facts: {
        method: hints?.method ?? 'UNKNOWN',
        fallbackSteps: verdict?.fallback_chain?.length ?? 0,
        topologyLocked: hints?.optimizationFlags?.freezeRouteSelection === true,
        physicalIncomplete: hints?.optimizationFlags?.physicalRealityIncomplete === true,
      },
      sourceRef: degradationHeadline.slice(0, 240),
    });
  }

  if (!nodes.length) return undefined;

  const sampleCount = mc?.total_samples;
  const headlineParts: string[] = [];
  if (degradationHeadline && hints?.method === 'HEURISTIC') {
    headlineParts.push(degradationHeadline);
  } else if (input.partyNoteZh) {
    headlineParts.push(input.partyNoteZh);
  }
  if (sampleCount) {
    headlineParts.push(`系统在后台模拟了约 ${sampleCount} 种不确定性演变后再给出推荐。`);
  }
  if (nodes.some((n) => n.kind === 'PERSONA_REPAIR')) {
    headlineParts.push('已对行程做过物理安全校验与自动修正。');
  }

  return {
    schemaVersion: CAUSAL_CHAIN_SCHEMA_V1,
    protectionHeadlineZh:
      headlineParts.join('') || '行程经 Decision Kernel 物理与合规校验后生成。',
    nodes,
    monteCarloSampleCount: sampleCount,
    chosenPlanId: verdict?.chosen_plan_id,
  };
}
