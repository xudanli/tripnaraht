/**
 * P-Next 10 — Structural + outcome drift between predicted and observed causal projections.
 */

import type { CausalGraph } from '../causal-physics/causal-graph.types';

export type DriftSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface CausalDriftReport {
  edgeDrift: number;
  nodeDrift: number;
  utilityGap: number;
  severity: DriftSeverity;
}

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function scalarSummary(g: CausalGraph): number {
  let s = 0;
  let n = 0;
  for (const node of g.nodes) {
    for (const v of Object.values(node.state)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        s += Math.abs(v);
        n += 1;
      }
    }
  }
  return n ? s / n : 0;
}

function edgeWeightDrift(a: CausalGraph, b: CausalGraph): number {
  const mapB = new Map(b.edges.map(e => [`${e.from}->${e.to}`, e.weight]));
  const abs: number[] = [];
  for (const e of a.edges) {
    const w = mapB.get(`${e.from}->${e.to}`);
    if (w !== undefined) abs.push(Math.abs(e.weight - w));
  }
  return mean(abs);
}

function severityFromSignals(
  utilityGap: number,
  edgeDrift: number,
  nodeDrift: number,
): DriftSeverity {
  const score = utilityGap + edgeDrift * 2 + nodeDrift * 2;
  if (score >= 0.35) return 'HIGH';
  if (score >= 0.18) return 'MEDIUM';
  return 'LOW';
}

export interface DetectCausalDriftInput {
  predictedUtility: number;
  observedUtility: number;
  predictedGraph: CausalGraph;
  observedGraph?: CausalGraph;
}

export function detectCausalDrift(input: DetectCausalDriftInput): CausalDriftReport {
  const utilityGap = Math.abs(input.observedUtility - input.predictedUtility);
  let edgeDrift = 0;
  let nodeDrift = 0;

  if (input.observedGraph) {
    edgeDrift = edgeWeightDrift(input.predictedGraph, input.observedGraph);
    nodeDrift = Math.abs(
      scalarSummary(input.predictedGraph) - scalarSummary(input.observedGraph),
    );
  }

  const severity = severityFromSignals(utilityGap, edgeDrift, nodeDrift);

  return {
    edgeDrift,
    nodeDrift,
    utilityGap,
    severity,
  };
}
