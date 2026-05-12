/**
 * P-Next 9 — do-operator style interventions + one-step structural propagation on domain graph.
 */

import type {
  CausalGraph,
  CausalIntervention,
  StateTrajectoryStep,
} from './causal-graph.types';

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function readScalar(nodeId: string, graph: CausalGraph, key: string): number {
  const n = graph.nodes.find(x => x.id === nodeId);
  const v = n?.state[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function cloneGraph(g: CausalGraph): CausalGraph {
  return {
    nodes: g.nodes.map(n => ({
      ...n,
      state: { ...n.state },
    })),
    edges: g.edges.map(e => ({ ...e })),
  };
}

/**
 * Apply interventions (state patches); if `doOperator`, incoming edge influence to that node is zeroed for propagation (mutilated graph stub).
 */
export function applyDoOperator(
  graph: CausalGraph,
  interventions: CausalIntervention[],
): CausalGraph {
  const out = cloneGraph(graph);
  const mutilated = new Set(
    interventions.filter(i => i.doOperator).map(i => i.targetNodeId),
  );

  for (const iv of interventions) {
    const node = out.nodes.find(n => n.id === iv.targetNodeId);
    if (!node) continue;
    node.state = { ...node.state, ...iv.statePatch };
  }

  /** Single-pass propagation: Weather/Fuel stress pushes Route and Temporal. */
  const route = out.nodes.find(n => n.id === 'domain:route');
  const temporal = out.nodes.find(n => n.id === 'domain:temporal');
  if (!route || !temporal || mutilated.has(route.id) || mutilated.has(temporal.id)) {
    return out;
  }

  const weatherStress = readScalar('domain:weather', out, 'meanExposure');
  const fuelStress = readScalar('domain:fuel', out, 'energyStress');
  const routeMobilityStress = readScalar('domain:route', out, 'mobilityStress');

  if (!mutilated.has('domain:weather')) {
    route.state.routeWeatherCoupling = clamp01(
      0.6 * weatherStress + 0.4 * Number(route.state.routeWeatherCoupling ?? 0),
    );
  }
  if (!mutilated.has('domain:fuel')) {
    route.state.routeFuelCoupling = clamp01(
      0.55 * fuelStress + 0.45 * Number(route.state.routeFuelCoupling ?? 0),
    );
  }

  temporal.state.temporalRouteCoupling = clamp01(
    0.65 * routeMobilityStress +
      0.35 * readScalar('domain:temporal', out, 'meanTemporalPressure'),
  );

  return out;
}

export function intervene(
  graph: CausalGraph,
  interventions: CausalIntervention[],
): CausalGraph {
  return applyDoOperator(graph, interventions);
}

/** Scalar utility: higher is better — stability under domain stress. */
export function evaluateCausalUtility(graph: CausalGraph): number {
  const routeStress = readScalar('domain:route', graph, 'mobilityStress');
  const temporalStress = readScalar('domain:temporal', graph, 'meanTemporalPressure');
  const weatherExp = readScalar('domain:weather', graph, 'meanExposure');
  const fuelStress = readScalar('domain:fuel', graph, 'energyStress');

  const strain = (routeStress + temporalStress + weatherExp + fuelStress) / 4;
  return clamp01(1 - strain);
}

export function buildOutcomeTrajectory(
  before: CausalGraph,
  after: CausalGraph,
  utilityAfter: number,
): StateTrajectoryStep[] {
  return [
    {
      stepIndex: 0,
      label: `pre:${before.nodes.length}n/${before.edges.length}e`,
      utility: evaluateCausalUtility(before),
    },
    {
      stepIndex: 1,
      label: `post_intervention`,
      utility: utilityAfter,
    },
  ];
}
