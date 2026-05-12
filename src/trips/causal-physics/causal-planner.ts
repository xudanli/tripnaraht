/**
 * P-Next 9 — Discrete intervention candidates + argmax expected utility `do(interventions)`.
 */

import type { ExecutionProof } from '../execution-trace-compressor/execution-proof.types';
import type { CausalGraph, CausalIntervention } from './causal-graph.types';
import {
  applyDoOperator,
  evaluateCausalUtility,
  buildOutcomeTrajectory,
} from './intervention-engine';

export interface CausalPlanningResult {
  bestInterventions: CausalIntervention[];
  utilityScore: number;
  graphAfter: CausalGraph;
  trajectory: ReturnType<typeof buildOutcomeTrajectory>;
}

/** Built-in library — composable with domain projection graph ids. */
export function defaultCandidateInterventions(): CausalIntervention[][] {
  return [
    [
      {
        id: 'do_clear_weather',
        targetNodeId: 'domain:weather',
        doOperator: true,
        statePatch: { meanExposure: 0.18 },
      },
    ],
    [
      {
        id: 'do_route_recovery',
        targetNodeId: 'domain:route',
        doOperator: true,
        statePatch: { mobilityStress: 0.15, meanMobility: 0.72 },
      },
    ],
    [
      {
        id: 'do_slack_time',
        targetNodeId: 'domain:temporal',
        doOperator: false,
        statePatch: { meanTemporalPressure: 0.22 },
      },
    ],
    [
      {
        id: 'do_combo_weather_route',
        targetNodeId: 'domain:weather',
        doOperator: true,
        statePatch: { meanExposure: 0.22 },
      },
      {
        id: 'do_combo_route',
        targetNodeId: 'domain:route',
        doOperator: false,
        statePatch: { mobilityStress: 0.2 },
      },
    ],
  ];
}

/**
 * Evaluates each candidate bundle on a **clone** of `graphBefore`; returns maximum-utility plan.
 */
export function planCausalInterventions(
  graphBefore: CausalGraph,
  candidates: CausalIntervention[][] = defaultCandidateInterventions(),
): CausalPlanningResult {
  let best: CausalPlanningResult | undefined;

  for (const bundle of candidates) {
    const after = applyDoOperator(graphBefore, bundle);
    const u = evaluateCausalUtility(after);
    if (!best || u > best.utilityScore) {
      best = {
        bestInterventions: bundle,
        utilityScore: u,
        graphAfter: after,
        trajectory: buildOutcomeTrajectory(
          graphBefore,
          after,
          u,
        ),
      };
    }
  }

  return (
    best ?? {
      bestInterventions: [],
      utilityScore: evaluateCausalUtility(graphBefore),
      graphAfter: graphBefore,
      trajectory: buildOutcomeTrajectory(graphBefore, graphBefore, evaluateCausalUtility(graphBefore)),
    }
  );
}

/** Attach P-Next 9 causal planning artifacts to an execution proof (typically baseline replica). */
export function attachCausalPlanningToProof(
  proof: ExecutionProof,
  graphBefore: CausalGraph,
  plan: CausalPlanningResult,
): ExecutionProof {
  return {
    ...proof,
    interventionSet: plan.bestInterventions,
    causalGraphBefore: graphBefore,
    causalGraphAfter: plan.graphAfter,
    outcomeTrajectory: plan.trajectory,
    utilityScore: plan.utilityScore,
  };
}
