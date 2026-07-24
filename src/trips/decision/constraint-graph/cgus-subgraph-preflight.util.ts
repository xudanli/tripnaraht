/**
 * CGUS 前置：全局常驻图子图提取 + 级联延迟 → 候选软约束。
 */

import type { CGUSCandidate } from '../optimization/cgus-search.service';
import type { WorldModelContext } from '../shared/world-model.types';
import {
  buildGlobalGraphFromWorldContext,
  resolveSubgraphAnchorNodeIds,
} from './global-graph-from-world.util';
import { extractConstrainedSubgraph } from './subgraph-extraction.util';
import type { SubgraphExtractionResult } from './global-spatiotemporal-graph.types';

export interface CgusSubgraphPreflightInput {
  worldContext: WorldModelContext;
  candidates: CGUSCandidate[];
  month: number;
  vehicleType?: '2WD' | '4WD';
  perturbation?: {
    closedEdgeIds?: string[];
    closedNodeIds?: string[];
    edgeDelayMinutes?: Record<string, number>;
  };
}

export interface CgusSubgraphPreflightResult {
  worldContext: WorldModelContext;
  subgraph: SubgraphExtractionResult['subgraph'];
  prunedNodeIds: string[];
  cascadeDelayHints: SubgraphExtractionResult['cascadeDelayHints'];
  candidates: CGUSCandidate[];
  stats: { nodeCount: number; edgeCount: number };
}

function applyCascadeDelaysToCandidates(
  candidates: CGUSCandidate[],
  hints: SubgraphExtractionResult['cascadeDelayHints'],
): CGUSCandidate[] {
  if (!hints.length) return candidates;
  const totalDelay = hints.reduce((s, h) => s + h.deltaMinutes, 0);
  const degree = Math.min(1, totalDelay / 120);
  return candidates.map((c) => ({
    ...c,
    constraintViolations: [
      ...(c.constraintViolations ?? []),
      {
        type: 'GLOBAL_SUBGRAPH_CASCADE_DELAY',
        severity: 'SOFT' as const,
        degree,
        detail: hints.map((h) => `${h.edgeId}+${h.deltaMinutes}m`).slice(0, 4).join('; '),
      },
    ],
  }));
}

export function runCgusSubgraphPreflight(
  input: CgusSubgraphPreflightInput,
): CgusSubgraphPreflightResult {
  const plan = input.candidates[0]?.plan;
  const segments = plan?.segments ?? [];
  const human = input.worldContext.partyAggregation?.effectiveCapability ?? input.worldContext.human;

  const globalGraph = buildGlobalGraphFromWorldContext(input.worldContext.physical, {
    segments,
    countryCode: input.worldContext.physical.countryCode,
  });

  const seeds = resolveSubgraphAnchorNodeIds(segments);
  const anchorNodeIds = seeds.length ? seeds : globalGraph.nodes.slice(0, 3).map((n) => n.id);

  const extraction = extractConstrainedSubgraph(globalGraph, {
    countryCode: input.worldContext.physical.countryCode ?? 'IS',
    anchorNodeIds,
    month: input.month,
    vehicleType: input.vehicleType,
    maxSlopePct: human.maxSlopePct,
    maxDailyAscentM: human.maxDailyAscentM,
    excludeNodeIds: input.worldContext.physical.roadStates
      ?.filter((r) => r.status === 'CLOSED')
      .map((r) => `road:${r.roadId ?? r.segmentId}`),
    perturbation: input.perturbation,
  });

  const enrichedWorld: WorldModelContext = {
    ...input.worldContext,
    subgraphExtraction: {
      prunedNodeIds: extraction.prunedNodeIds,
      cascadeDelayHints: extraction.cascadeDelayHints,
      stats: {
        nodeCount: extraction.subgraph.stats.nodeCount,
        edgeCount: extraction.subgraph.stats.edgeCount,
      },
    },
  };

  return {
    worldContext: enrichedWorld,
    subgraph: extraction.subgraph,
    prunedNodeIds: extraction.prunedNodeIds,
    cascadeDelayHints: extraction.cascadeDelayHints,
    candidates: applyCascadeDelaysToCandidates(input.candidates, extraction.cascadeDelayHints),
    stats: {
      nodeCount: extraction.subgraph.stats.nodeCount,
      edgeCount: extraction.subgraph.stats.edgeCount,
    },
  };
}
