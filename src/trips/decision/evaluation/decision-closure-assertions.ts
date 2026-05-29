/**
 * P0：冰岛决策闭环 golden 断言（optimizationHints + explain 投影形状）。
 */
import type { OptimizationHints } from '../../../decision/kernel/decision-state.types';
import {
  buildDecisionVerdictFromHints,
  type OptimizationDecisionVerdict,
} from '../../../decision/kernel/decision-verdict.util';
import { formatDecisionVerdictNarrationZh } from '../../../agent/utils/decision-verdict-narration.zh.util';
import type { DecisionClosureExpected } from './e2e-case.types';

export interface DecisionClosureExplainProjection {
  decision_verdict?: {
    chosen_plan_id: string;
    rejected_plans: OptimizationDecisionVerdict['rejected_plans'];
    monte_carlo_summary?: OptimizationDecisionVerdict['monte_carlo_summary'];
    fallback_chain?: OptimizationDecisionVerdict['fallback_chain'];
  };
  decision_verdict_narration_zh?: string;
  world_constraint_materialization?: {
    applied_events: number;
    road_ids: string[];
    weather_dates: string[];
    store_version?: number;
    unified_graph_node_count?: number;
    unified_graph_edge_count?: number;
  };
  meta_decision_audit?: string;
}

/** Mirrors route-and-run `buildOptimizationExplain` snake_case projection for contract tests. */
export function projectDecisionClosureExplain(
  hints: OptimizationHints,
): DecisionClosureExplainProjection | undefined {
  if (!hints || typeof hints !== 'object') return undefined;
  const verdict = hints.decisionVerdict ?? buildDecisionVerdictFromHints(hints);
  const wm = hints.worldConstraintMaterialization;
  return {
    ...(hints.metaDecisionAudit ? { meta_decision_audit: hints.metaDecisionAudit } : {}),
    ...(verdict
      ? {
          decision_verdict: {
            chosen_plan_id: verdict.chosen_plan_id,
            rejected_plans: verdict.rejected_plans,
            monte_carlo_summary: verdict.monte_carlo_summary,
            fallback_chain: verdict.fallback_chain,
          },
        }
      : {}),
    decision_verdict_narration_zh:
      hints.decisionVerdictNarrationZh?.trim() ||
      formatDecisionVerdictNarrationZh(verdict, hints) ||
      undefined,
    ...(wm !== undefined
      ? {
          world_constraint_materialization: {
            applied_events: wm.appliedEvents ?? 0,
            road_ids: wm.roadIds ?? [],
            weather_dates: wm.weatherDates ?? [],
            ...(wm.storeVersion !== undefined ? { store_version: wm.storeVersion } : {}),
            ...(wm.unifiedGraphNodeCount !== undefined
              ? { unified_graph_node_count: wm.unifiedGraphNodeCount }
              : {}),
            ...(wm.unifiedGraphEdgeCount !== undefined
              ? { unified_graph_edge_count: wm.unifiedGraphEdgeCount }
              : {}),
          },
        }
      : {}),
  };
}

export function assertDecisionClosureHints(
  hints: OptimizationHints,
  expected: DecisionClosureExpected,
): { passed: boolean; diff: string[] } {
  const diff: string[] = [];
  const verdict = hints.decisionVerdict ?? buildDecisionVerdictFromHints(hints);

  if (expected.mustHaveDecisionVerdict && !verdict?.chosen_plan_id) {
    diff.push('decisionClosure: missing chosen_plan_id on verdict');
  }
  if (expected.chosenPlanId && verdict?.chosen_plan_id !== expected.chosenPlanId) {
    diff.push(
      `decisionClosure.chosenPlanId: expected ${expected.chosenPlanId}, actual ${verdict?.chosen_plan_id}`,
    );
  }
  if (expected.chosenPlanIdIncludes?.length) {
    const id = verdict?.chosen_plan_id ?? '';
    for (const sub of expected.chosenPlanIdIncludes) {
      if (!id.includes(sub)) {
        diff.push(`decisionClosure.chosenPlanIdIncludes: "${sub}" not in "${id}"`);
      }
    }
  }
  if (expected.minRejectedPlans !== undefined) {
    const n = verdict?.rejected_plans?.length ?? 0;
    if (n < expected.minRejectedPlans) {
      diff.push(`decisionClosure.minRejectedPlans: expected >=${expected.minRejectedPlans}, actual ${n}`);
    }
  }
  if (expected.metaDecisionAuditIncludes?.length) {
    const audit = hints.metaDecisionAudit ?? '';
    for (const sub of expected.metaDecisionAuditIncludes) {
      if (!audit.includes(sub)) {
        diff.push(`decisionClosure.metaDecisionAuditIncludes: missing "${sub}" in "${audit}"`);
      }
    }
  }
  const narration =
    hints.decisionVerdictNarrationZh?.trim() ||
    formatDecisionVerdictNarrationZh(verdict, hints) ||
    '';
  if (expected.narrationZhMinLength !== undefined && narration.length < expected.narrationZhMinLength) {
    diff.push(
      `decisionClosure.narrationZhMinLength: expected >=${expected.narrationZhMinLength}, actual ${narration.length}`,
    );
  }
  if (expected.narrationZhIncludes?.length) {
    for (const sub of expected.narrationZhIncludes) {
      if (!narration.includes(sub)) {
        diff.push(`decisionClosure.narrationZhIncludes: missing "${sub}"`);
      }
    }
  }
  if (expected.monteCarloMinTotalSamples !== undefined) {
    const total = verdict?.monte_carlo_summary?.total_samples ?? 0;
    if (total < expected.monteCarloMinTotalSamples) {
      diff.push(
        `decisionClosure.monteCarloMinTotalSamples: expected >=${expected.monteCarloMinTotalSamples}, actual ${total}`,
      );
    }
  }
  const wm = hints.worldConstraintMaterialization;
  const wmExp = expected.worldMaterialization;
  if (wmExp) {
    if (wmExp.minAppliedEvents !== undefined) {
      const applied = wm?.appliedEvents ?? 0;
      if (applied < wmExp.minAppliedEvents) {
        diff.push(
          `decisionClosure.worldMaterialization.minAppliedEvents: expected >=${wmExp.minAppliedEvents}, actual ${applied}`,
        );
      }
    }
    if (wmExp.roadIdsIncludes?.length) {
      const roads = wm?.roadIds ?? [];
      for (const rid of wmExp.roadIdsIncludes) {
        if (!roads.includes(rid)) {
          diff.push(`decisionClosure.worldMaterialization.roadIdsIncludes: missing "${rid}" in [${roads.join(',')}]`);
        }
      }
    }
    if (wmExp.minWeatherDates !== undefined) {
      const wd = wm?.weatherDates?.length ?? 0;
      if (wd < wmExp.minWeatherDates) {
        diff.push(
          `decisionClosure.worldMaterialization.minWeatherDates: expected >=${wmExp.minWeatherDates}, actual ${wd}`,
        );
      }
    }
  }

  return { passed: diff.length === 0, diff };
}

export function loadDecisionClosureGolden(metadata: {
  decisionClosureGolden?: Record<string, unknown>;
}): OptimizationHints | undefined {
  const raw = metadata.decisionClosureGolden;
  if (!raw || typeof raw !== 'object') return undefined;
  const hints = (raw as { optimizationHints?: unknown }).optimizationHints ?? raw;
  return hints as OptimizationHints;
}
