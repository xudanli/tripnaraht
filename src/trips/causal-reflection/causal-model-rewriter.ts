/**
 * P-Next 10 — Lift / revise causal hypotheses from evidence (weights + meta).
 */

import type { CausalGraph } from '../causal-physics/causal-graph.types';
import { correctCausalWeights } from '../causal-physics/causal-feedback';
import type { CausalEvidence, CausalModel, CausalModelMeta, ModelPatch } from './causal-model.types';

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export function graphToCausalModel(
  graph: CausalGraph,
  meta: CausalModelMeta,
  modelId?: string,
): CausalModel {
  return {
    modelId,
    nodes: graph.nodes.map(n => ({ ...n, state: { ...n.state } })),
    edges: graph.edges.map(e => ({ ...e })),
    meta: { ...meta },
  };
}

export function causalModelToGraph(model: CausalModel): CausalGraph {
  return { nodes: model.nodes, edges: model.edges };
}

function edgeKey(e: { from: string; to: string }): string {
  return `${e.from}->${e.to}`;
}

/**
 * Deterministic revision: run edge correction from utility gap, emit patches, optionally bump epoch.
 */
export function reviseModel(model: CausalModel, evidence: CausalEvidence): CausalModel {
  const graph = causalModelToGraph(model);
  const adjusted = correctCausalWeights({
    graph,
    predictedUtility: evidence.predictedUtility,
    observedUtility: evidence.observedUtility,
  });

  const edgeUpdates: NonNullable<ModelPatch['edgeUpdates']> = [];

  for (let i = 0; i < model.edges.length; i++) {
    const before = model.edges[i]!;
    const after = adjusted.edges[i];
    if (!after || before.weight === after.weight) continue;
    edgeUpdates.push({
      from: before.from,
      to: before.to,
      deltaWeight: after.weight - before.weight,
    });
  }

  const gap = Math.abs(evidence.observedUtility - evidence.predictedUtility);
  const metaConfidenceDelta = gap > 0.12 ? -0.04 * gap : 0.02 * (1 - gap);

  const nextMeta = {
    ...model.meta,
    confidence: clamp01(model.meta.confidence + metaConfidenceDelta),
    revisionEpoch:
      edgeUpdates.length > 0
        ? (model.meta.revisionEpoch ?? 0) + 1
        : model.meta.revisionEpoch,
    origin: model.meta.origin === 'OBSERVED' ? 'LEARNED' : model.meta.origin,
  };

  return {
    ...model,
    nodes: adjusted.nodes.map(n => ({ ...n, state: { ...n.state } })),
    edges: adjusted.edges.map(e => ({ ...e })),
    meta: nextMeta,
  };
}

/** Pure apply of explicit patches (tests / replay). */
export function applyModelPatches(model: CausalModel, patches: ModelPatch[]): CausalModel {
  let m = model;
  for (const p of patches) {
    let edges = m.edges.map(e => ({ ...e }));
    if (p.edgeUpdates?.length) {
      const deltaByKey = new Map<string, number>(
        p.edgeUpdates.map(u => [`${u.from}->${u.to}`, u.deltaWeight]),
      );
      edges = edges.map(e => {
        const d = deltaByKey.get(edgeKey(e));
        return d !== undefined ? { ...e, weight: clamp01(e.weight + d) } : e;
      });
    }
    const meta = {
      ...m.meta,
      confidence: clamp01(m.meta.confidence + (p.metaConfidenceDelta ?? 0)),
      revisionEpoch:
        p.bumpRevisionEpoch === true
          ? (m.meta.revisionEpoch ?? 0) + 1
          : m.meta.revisionEpoch,
    };
    m = { ...m, edges, meta };
  }
  return m;
}
