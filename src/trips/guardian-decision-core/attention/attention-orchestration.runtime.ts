/**
 * Slice 4 Shadow-only cluster runtime — consumes Canonical Problems, does not detect.
 */

import type {
  AttentionOrchestrationContext,
  AttentionOrchestrationProblemInput,
  CausalNode,
  RootCauseCluster,
  RootCauseClusterUpsertResult,
} from '../contracts/attention-orchestration.types';
import {
  computeAttentionLevelForProblems,
  escalateAttentionLevel,
  shouldNotifyForAttentionChange,
} from './attention-admission.util';
import { buildWeatherStrongWindRootCauseKey } from './build-weather-strong-wind-root-cause-key.util';
import { selectPrimaryProblemId } from './primary-problem-selector.util';
import { createClusterId, RootCauseClusterStore } from './root-cause-cluster.store';
import {
  defaultWindRootCauseType,
  isRoadClusterSemanticCapability,
  isWindClusterSemanticCapability,
  semanticCapabilityToWindChainCode,
  WIND_CAUSAL_CHAIN_LABELS,
} from './wind-causal-chain.rules';
import { listVisiblePrimaryItems } from './unified-decision-item.projection';
import {
  isWeatherRootCapability,
  problemHasMergeAuthority,
  resolveWeatherEpisodeId,
} from './episode-merge-authority.util';

const TERMINAL_STATUSES = new Set(['RESOLVED', 'FAILED']);

export interface AttentionOrchestrationRuntimeOptions {
  now?: string;
}

export class AttentionOrchestrationRuntime {
  readonly store = new RootCauseClusterStore();
  private problemsById = new Map<string, AttentionOrchestrationProblemInput>();

  constructor(private readonly options: AttentionOrchestrationRuntimeOptions = {}) {}

  snapshotProblems(): AttentionOrchestrationProblemInput[] {
    return [...this.problemsById.values()];
  }

  getProblem(problemId: string): AttentionOrchestrationProblemInput | undefined {
    return this.problemsById.get(problemId);
  }

  listVisiblePrimaryItems() {
    return listVisiblePrimaryItems({
      clusters: this.store.listAll(),
      problemsById: this.problemsById,
    });
  }

  ingestProblem(
    problem: AttentionOrchestrationProblemInput,
    context: AttentionOrchestrationContext,
  ): RootCauseClusterUpsertResult {
    this.problemsById.set(problem.problemId, problem);
    const at = context.now ?? this.now();

    const rootCauseKey = resolveRootCauseKey(problem, context, this);
    if (!rootCauseKey) {
      return this.upsertStandaloneCluster(
        problem,
        `orphan:${problem.problemId}`,
        'UNMERGED',
        at,
      );
    }

    if (
      isRoadClusterSemanticCapability(problem.semanticCapability) &&
      !problem.rootCauseKey
    ) {
      return this.upsertStandaloneCluster(problem, rootCauseKey, 'ROAD_CLOSED', at);
    }

    return this.upsertWindCluster(problem, context, rootCauseKey, at);
  }

  acknowledgeCluster(clusterId: string, at?: string): RootCauseCluster | undefined {
    const cluster = this.store.getByClusterId(clusterId);
    if (!cluster) return undefined;
    const now = at ?? this.now();
    const updated: RootCauseCluster = {
      ...cluster,
      status: 'ACKNOWLEDGED',
      acknowledgedAt: now,
      attentionLevel: 'SILENT',
      lastUpdatedAt: now,
    };
    this.store.save(updated);
    return updated;
  }

  resolveCluster(clusterId: string, at?: string): RootCauseCluster | undefined {
    const cluster = this.store.getByClusterId(clusterId);
    if (!cluster) return undefined;
    const now = at ?? this.now();
    const updated: RootCauseCluster = {
      ...cluster,
      status: 'RESOLVED',
      attentionLevel: 'SILENT',
      lastUpdatedAt: now,
    };
    this.store.save(updated);
    return updated;
  }

  private upsertStandaloneCluster(
    problem: AttentionOrchestrationProblemInput,
    rootCauseKey: string,
    rootCauseType: string,
    at: string,
  ): RootCauseClusterUpsertResult {
    const existing = this.store.getByRootCauseKey(rootCauseKey);
    const now = at;
    const relatedIds = uniqueIds([...(existing?.relatedProblemIds ?? []), problem.problemId]);
    const clusterProblems = relatedIds
      .map((id) => this.problemsById.get(id))
      .filter((p): p is AttentionOrchestrationProblemInput => Boolean(p));

    const primaryProblemId = selectPrimaryProblemId(clusterProblems) ?? problem.problemId;
    const proposedAttention = computeAttentionLevelForProblems(clusterProblems, 'OPEN');
    const previousAttention = existing?.attentionLevel ?? 'SILENT';
    const { level: attentionLevel, escalated } = escalateAttentionLevel(
      previousAttention,
      proposedAttention,
    );

    if (existing) {
      const updated: RootCauseCluster = {
        ...existing,
        primaryProblemId,
        relatedProblemIds: relatedIds.filter((id) => id !== primaryProblemId),
        attentionLevel,
        lastUpdatedAt: now,
        lastAttentionEscalatedAt: escalated ? now : existing.lastAttentionEscalatedAt,
      };
      this.store.save(updated);
      return {
        cluster: updated,
        created: false,
        primaryChanged: existing.primaryProblemId !== primaryProblemId,
        attentionEscalated: escalated,
        shouldNotify: shouldNotifyForAttentionChange({
          previousLevel: previousAttention,
          nextLevel: attentionLevel,
          status: updated.status,
          acknowledgedAt: updated.acknowledgedAt,
        }),
      };
    }

    const cluster: RootCauseCluster = {
      clusterId: createClusterId(rootCauseKey),
      tripId: problem.tripId,
      rootCauseKey,
      rootCauseType,
      primaryProblemId,
      relatedProblemIds: relatedIds.filter((id) => id !== primaryProblemId),
      causalChain: [],
      attentionLevel,
      status: 'OPEN',
      firstObservedAt: now,
      lastUpdatedAt: now,
    };
    this.store.save(cluster);
    return {
      cluster,
      created: true,
      primaryChanged: true,
      attentionEscalated: escalated,
      shouldNotify: shouldNotifyForAttentionChange({
        previousLevel: 'SILENT',
        nextLevel: attentionLevel,
        status: cluster.status,
      }),
    };
  }

  private upsertWindCluster(
    problem: AttentionOrchestrationProblemInput,
    context: AttentionOrchestrationContext,
    rootCauseKey: string,
    at: string,
  ): RootCauseClusterUpsertResult {
    const existing = this.store.getByRootCauseKey(rootCauseKey);
    const now = at;

    const mergedIds = uniqueIds([
      ...(existing?.relatedProblemIds ?? []),
      existing?.primaryProblemId,
      problem.problemId,
    ].filter(Boolean) as string[]);

    const clusterProblems = mergedIds
      .map((id) => this.problemsById.get(id))
      .filter((p): p is AttentionOrchestrationProblemInput => Boolean(p));

    const primaryProblemId = selectPrimaryProblemId(clusterProblems) ?? problem.problemId;
    const relatedProblemIds = mergedIds.filter((id) => id !== primaryProblemId);
    const status = existing?.status ?? 'OPEN';
    const proposedAttention = computeAttentionLevelForProblems(clusterProblems, status);
    const previousAttention = existing?.attentionLevel ?? 'SILENT';
    const { level: attentionLevel, escalated } = escalateAttentionLevel(
      previousAttention,
      proposedAttention,
    );

    const causalChain = buildWindCausalChain(clusterProblems, existing?.causalChain);

    if (existing) {
      const semanticUnchanged =
        existing.primaryProblemId === primaryProblemId &&
        !escalated &&
        relatedProblemIds.length === existing.relatedProblemIds.length;

      const updated: RootCauseCluster = {
        ...existing,
        primaryProblemId,
        relatedProblemIds,
        causalChain,
        attentionLevel,
        lastUpdatedAt: now,
        lastAttentionEscalatedAt: escalated ? now : existing.lastAttentionEscalatedAt,
      };
      this.store.save(updated);
      return {
        cluster: updated,
        created: false,
        primaryChanged: existing.primaryProblemId !== primaryProblemId,
        attentionEscalated: escalated,
        shouldNotify:
          !semanticUnchanged &&
          shouldNotifyForAttentionChange({
            previousLevel: previousAttention,
            nextLevel: attentionLevel,
            status: updated.status,
            acknowledgedAt: updated.acknowledgedAt,
          }),
      };
    }

    const cluster: RootCauseCluster = {
      clusterId: createClusterId(rootCauseKey),
      tripId: context.tripId,
      rootCauseKey,
      rootCauseType: defaultWindRootCauseType(),
      primaryProblemId,
      relatedProblemIds,
      causalChain,
      attentionLevel,
      status: 'OPEN',
      firstObservedAt: now,
      lastUpdatedAt: now,
    };
    this.store.save(cluster);
    return {
      cluster,
      created: true,
      primaryChanged: true,
      attentionEscalated: escalated,
      shouldNotify: shouldNotifyForAttentionChange({
        previousLevel: 'SILENT',
        nextLevel: attentionLevel,
        status: cluster.status,
      }),
    };
  }

  private now(): string {
    return this.options.now ?? new Date().toISOString();
  }
}

export function resolveRootCauseKey(
  problem: AttentionOrchestrationProblemInput,
  context: AttentionOrchestrationContext,
  runtime?: AttentionOrchestrationRuntime,
): string | undefined {
  if (problem.rootCauseKey) return problem.rootCauseKey;

  if (isWindClusterSemanticCapability(problem.semanticCapability)) {
    const parent = problem.causedByProblemId && runtime
      ? runtime.getProblem(problem.causedByProblemId)
      : undefined;
    const episodeId = resolveWeatherEpisodeId({
      problem,
      contextEpisodeId: context.weatherEpisodeId,
      parentEpisodeId: parent?.weatherEpisodeId,
    });
    if (!episodeId) return undefined;

    return buildWeatherStrongWindRootCauseKey({
      tripId: context.tripId,
      routeSegmentId: problem.routeSegmentId ?? context.routeSegmentId,
      weatherEpisodeId: episodeId,
    });
  }

  if (isRoadClusterSemanticCapability(problem.semanticCapability)) {
    const segmentId = problem.routeSegmentId ?? context.routeSegmentId;
    return `road.is:${segmentId}:CLOSED`;
  }

  if (problem.causedByProblemId && runtime) {
    const parent = runtime.getProblem(problem.causedByProblemId);
    if (parent) {
      return resolveRootCauseKey(parent, context, runtime);
    }
  }

  return undefined;
}

export function shouldMergeProblems(
  a: AttentionOrchestrationProblemInput,
  b: AttentionOrchestrationProblemInput,
  context: AttentionOrchestrationContext,
  runtime?: AttentionOrchestrationRuntime,
): boolean {
  if (isRoadClusterSemanticCapability(a.semanticCapability) &&
      isWindClusterSemanticCapability(b.semanticCapability)) {
    return false;
  }
  if (isWindClusterSemanticCapability(a.semanticCapability) &&
      isRoadClusterSemanticCapability(b.semanticCapability)) {
    return false;
  }

  if (b.causedByProblemId === a.problemId || a.causedByProblemId === b.problemId) {
    return true;
  }

  if (!problemHasMergeAuthority(a) || !problemHasMergeAuthority(b)) {
    return false;
  }

  const keyA = resolveRootCauseKey(a, context, runtime);
  const keyB = resolveRootCauseKey(b, context, runtime);
  if (!keyA || !keyB) return false;
  if (keyA === keyB) return true;

  return false;
}

function buildWindCausalChain(
  problems: AttentionOrchestrationProblemInput[],
  existing: CausalNode[] = [],
): CausalNode[] {
  const byCode = new Map<string, CausalNode>();
  for (const node of existing) {
    byCode.set(node.code, node);
  }

  for (const problem of problems) {
    const code = semanticCapabilityToWindChainCode(problem.semanticCapability);
    if (!code) continue;
    byCode.set(code, {
      code,
      label: WIND_CAUSAL_CHAIN_LABELS[code],
      problemId: problem.problemId,
      order: WIND_CAUSAL_CHAIN_ORDER[code],
    });
  }

  return [...byCode.values()].sort((a, b) => a.order - b.order);
}

const WIND_CAUSAL_CHAIN_ORDER: Record<string, number> = {
  WEATHER_STRONG_WIND: 0,
  DRIVING_SPEED_REDUCED: 1,
  EXECUTION_DEPARTURE_SLIP: 2,
  EXECUTION_SCHEDULE_INFEASIBLE: 3,
  ACTIVITY_WINDOW_MISSED: 4,
  NIGHT_DRIVING_RISK: 5,
};

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

export function countOpenClusters(store: RootCauseClusterStore, tripId: string): number {
  return store.listByTripId(tripId).filter((c) => c.status === 'OPEN').length;
}

export function countVisiblePrimaryItems(runtime: AttentionOrchestrationRuntime): number {
  return runtime.listVisiblePrimaryItems().length;
}
