/**
 * Semantic Runtime — 事件归约器（时间一致的语义 lineage）
 *
 * v2：`ENGINE_FULL_REBUILD` + `SEMANTIC_DELTA`（后者 v0 仍走全量 `fullRebuildFallback`）。
 * 增量局部合并仅在 Phase 3 于此追加分支；禁止在业务服务内手写合并语义。
 */

import { getDefaultIcelandRoadConstraintGraph } from '../../../iceland-road/road-constraint.graph';
import { propagateRoadConstraint } from '../../../iceland-road/road-constraint.propagation';
import { roadConstraintImpactToSemanticDeltaEvent } from '../../../iceland-road/road-constraint-semantic.adapter';
import { applyRoadFactMutation } from '../../../world/world-mutation.gateway';
import { roadConstraintEventAndImpactToDiff } from '../../../world/road-graph-to-ssot.mapper';
import {
  buildRoadConstraintRuntimeTrace,
  resolveTripImpact,
  type TripImpact,
} from '../../road/road-trip-impact.resolver';
import type { BuildUnifiedExecutionSemanticViewInput } from './unified-execution-semantic-view';
import type { SlotConstraintFusionTraceV0 } from '../../constraints/fusion-trace.types';
import {
  buildSlotBlockedSemanticDelta,
  buildSlotConstraintFusionTrace,
  fuseConstraints,
} from '../../constraints/constraint-fusion.engine';
import { buildPartialReplanGraphFromPlan } from '../../replan/build-partial-replan-graph';
import { extractImpactSubgraph } from '../../replan/impact-subgraph.extractor';
import {
  executePartialReplan,
  type PartialReplanResult,
} from '../../replan/partial-replan.executor';
import { computeRepairsForBlockedSlots } from '../../repair/slot-repair.engine';
import type {
  PartialReplanRuntimeTraceV0,
  RoadConstraintRuntimeTraceV0,
  SlotRepairRuntimeTraceV0,
  UnifiedExecutionSemanticView,
} from './unified-execution-semantic-view';
import type { SemanticDeltaEvent } from './semantic-delta-event.types';
import type { SemanticRuntimeEvent } from './semantic-runtime-events.types';
import {
  resolveSemanticStaleRegionsV0,
  validateSemanticDeltaImpactV0,
} from './semantic-delta-impact-matrix';
import type { SemanticImpactTraceV0 } from './semantic-impact.types';
import { resolveSemanticDeltaPropagationV0 } from './semantic-delta-propagation.stub';
import { buildTripExecutionSemanticViewSnapshot } from './trip-execution-semantic-view.builder';

function mergeRoadConstraintPayloadWithTrip(
  delta: SemanticDeltaEvent,
  tripImpact: TripImpact,
): SemanticDeltaEvent {
  if (delta.kind !== 'ROAD_CONSTRAINT_CHANGE') return delta;
  return {
    ...delta,
    payload: {
      ...delta.payload,
      tripAffectedDays: tripImpact.affectedDays,
      tripAffectedSlotIds: tripImpact.affectedSlots,
      tripImpactSeverity: tripImpact.severity,
      requiredActions: tripImpact.requiredActions,
    },
  };
}

function commitFullRebuild(
  parentFingerprint: string | undefined,
  revision: number,
  payload: BuildUnifiedExecutionSemanticViewInput,
  lineage: {
    eventId: string;
    eventKind: string;
    lastSemanticDeltaKind?: string;
    lastSemanticImpactTrace?: SemanticImpactTraceV0;
    roadConstraintRuntimeTrace?: RoadConstraintRuntimeTraceV0;
    slotConstraintFusionTrace?: SlotConstraintFusionTraceV0;
    slotRepairTrace?: SlotRepairRuntimeTraceV0;
    partialReplanTrace?: PartialReplanRuntimeTraceV0;
  },
): UnifiedExecutionSemanticView {
  const snap = buildTripExecutionSemanticViewSnapshot(payload);
  return {
    ...snap,
    authority: snap.authority
      ? {
          ...snap.authority,
          lineage: {
            parentFingerprint,
            revision,
            lastEventId: lineage.eventId,
            lastEventKind: lineage.eventKind,
            ...(lineage.lastSemanticDeltaKind !== undefined
              ? { lastSemanticDeltaKind: lineage.lastSemanticDeltaKind }
              : {}),
            ...(lineage.lastSemanticImpactTrace !== undefined
              ? { lastSemanticImpactTrace: lineage.lastSemanticImpactTrace }
              : {}),
            ...(lineage.roadConstraintRuntimeTrace !== undefined
              ? { roadConstraintRuntimeTrace: lineage.roadConstraintRuntimeTrace }
              : {}),
            ...(lineage.slotConstraintFusionTrace !== undefined
              ? { slotConstraintFusionTrace: lineage.slotConstraintFusionTrace }
              : {}),
            ...(lineage.slotRepairTrace !== undefined
              ? { slotRepairTrace: lineage.slotRepairTrace }
              : {}),
            ...(lineage.partialReplanTrace !== undefined
              ? { partialReplanTrace: lineage.partialReplanTrace }
              : {}),
          },
        }
      : undefined,
  };
}

function buildPartialReplanExecutedDelta(
  result: PartialReplanResult,
  boundarySlotIds: readonly string[],
): SemanticDeltaEvent {
  return {
    kind: 'PARTIAL_REPLAN_EXECUTED',
    payload: {
      changedSlotIds: result.diff.changedSlotIds,
      boundarySlotIds: [...boundarySlotIds],
      diff: result.diff,
    },
    impact: {
      affectedDomains: ['CONSTRAINT_FUSION'],
      impactScope: 'GLOBAL',
    },
  };
}

function applySemanticDeltaRebuild(
  parentFingerprint: string | undefined,
  currentRevision: number,
  ev: { id: string; kind: string },
  delta: SemanticDeltaEvent,
  fullRebuildFallback: BuildUnifiedExecutionSemanticViewInput,
  layerTraces?: {
    roadConstraintRuntimeTrace?: RoadConstraintRuntimeTraceV0;
    slotConstraintFusionTrace?: SlotConstraintFusionTraceV0;
    slotRepairTrace?: SlotRepairRuntimeTraceV0;
    partialReplanTrace?: PartialReplanRuntimeTraceV0;
  },
): UnifiedExecutionSemanticView {
  void resolveSemanticDeltaPropagationV0(delta);
  const checked = validateSemanticDeltaImpactV0(delta);
  if (!checked.ok) {
    throw new Error(
      `semantic-runtime: invalid semantic impact — ${checked.issues.join('; ')}`,
    );
  }
  const staleRegions = resolveSemanticStaleRegionsV0(delta);
  const nextRevision = currentRevision + 1;
  return commitFullRebuild(parentFingerprint, nextRevision, fullRebuildFallback, {
    eventId: ev.id,
    eventKind: ev.kind,
    lastSemanticDeltaKind: delta.kind,
    lastSemanticImpactTrace: {
      affectedDomains: [...delta.impact.affectedDomains],
      impactScope: delta.impact.impactScope,
      staleRegions: [...staleRegions],
    },
    ...(layerTraces?.roadConstraintRuntimeTrace !== undefined
      ? { roadConstraintRuntimeTrace: layerTraces.roadConstraintRuntimeTrace }
      : {}),
    ...(layerTraces?.slotConstraintFusionTrace !== undefined
      ? { slotConstraintFusionTrace: layerTraces.slotConstraintFusionTrace }
      : {}),
    ...(layerTraces?.slotRepairTrace !== undefined
      ? { slotRepairTrace: layerTraces.slotRepairTrace }
      : {}),
    ...(layerTraces?.partialReplanTrace !== undefined
      ? { partialReplanTrace: layerTraces.partialReplanTrace }
      : {}),
  });
}

export function reduceSemanticRuntimeView(
  previous: UnifiedExecutionSemanticView | undefined,
  events: readonly SemanticRuntimeEvent[],
): UnifiedExecutionSemanticView {
  if (!events.length) {
    throw new Error('semantic-runtime: empty event list');
  }

  let parentFingerprint = previous?.authority?.inputsFingerprint;
  let revision = previous?.authority?.lineage?.revision ?? 0;

  let output: UnifiedExecutionSemanticView | undefined;

  for (const ev of events) {
    switch (ev.kind) {
      case 'ENGINE_FULL_REBUILD': {
        revision += 1;
        output = commitFullRebuild(parentFingerprint, revision, ev.payload, {
          eventId: ev.id,
          eventKind: ev.kind,
        });
        parentFingerprint = output.authority?.inputsFingerprint;
        break;
      }
      case 'SEMANTIC_DELTA': {
        output = applySemanticDeltaRebuild(
          parentFingerprint,
          revision,
          { id: ev.id, kind: ev.kind },
          ev.delta,
          ev.fullRebuildFallback,
        );
        revision = output.authority?.lineage?.revision ?? revision;
        parentFingerprint = output.authority?.inputsFingerprint;
        break;
      }
      case 'ROAD_CONSTRAINT_UPDATE': {
        const graph = ev.graph ?? getDefaultIcelandRoadConstraintGraph();
        const impact = propagateRoadConstraint(graph, ev.constraintEvent);
        if (ev.worldConstraintStore) {
          const roadDiff = roadConstraintEventAndImpactToDiff(
            ev.constraintEvent,
            impact,
          );
          applyRoadFactMutation(
            ev.worldConstraintStore,
            {
              channel: 'GRAPH_SSOT_DIFF',
              diff: roadDiff,
              options: {
                tripPlan: ev.tripPlan,
                atMs: Number.isFinite(Date.parse(ev.at))
                  ? Date.parse(ev.at)
                  : undefined,
              },
            },
            { tripPlan: ev.tripPlan },
          );
        }
        let delta = roadConstraintImpactToSemanticDeltaEvent(impact, [
          ev.constraintEvent.roadId.trim(),
        ]);
        let trace = buildRoadConstraintRuntimeTrace(impact);
        if (ev.tripPlan) {
          const tripImpact = resolveTripImpact(impact, ev.tripPlan, graph);
          delta = mergeRoadConstraintPayloadWithTrip(delta, tripImpact);
          trace = buildRoadConstraintRuntimeTrace(impact, tripImpact);
        }
        output = applySemanticDeltaRebuild(
          parentFingerprint,
          revision,
          { id: ev.id, kind: ev.kind },
          delta,
          ev.fullRebuildFallback,
          { roadConstraintRuntimeTrace: trace },
        );
        revision = output.authority?.lineage?.revision ?? revision;
        parentFingerprint = output.authority?.inputsFingerprint;
        break;
      }
      case 'CONSTRAINT_FUSION_UPDATE': {
        const fused = fuseConstraints(ev.domainOutputs);
        const slotTrace = buildSlotConstraintFusionTrace(fused);
        const hasBlocked = [...fused.values()].some((s) => s.isBlocked);

        if (ev.tripPlan && hasBlocked) {
          const blockedIds = [...fused.entries()]
            .filter(([, s]) => s.isBlocked)
            .map(([id]) => id);
          const replanGraph = buildPartialReplanGraphFromPlan(ev.tripPlan);
          const subgraph = extractImpactSubgraph(replanGraph, blockedIds);
          const replanResult = executePartialReplan(subgraph, ev.tripPlan);
          const repairs = computeRepairsForBlockedSlots(fused, ev.tripPlan);
          const delta = buildPartialReplanExecutedDelta(replanResult, blockedIds);
          const repairTrace: SlotRepairRuntimeTraceV0 = { repairs };
          const partialTrace: PartialReplanRuntimeTraceV0 = {
            changedSlotIds: replanResult.diff.changedSlotIds,
            boundarySlotIds: blockedIds,
            subgraphNodeIds: subgraph.nodes.map((n) => n.id),
          };
          output = applySemanticDeltaRebuild(
            parentFingerprint,
            revision,
            { id: ev.id, kind: ev.kind },
            delta,
            ev.fullRebuildFallback,
            {
              slotConstraintFusionTrace: slotTrace,
              slotRepairTrace: repairTrace,
              partialReplanTrace: partialTrace,
            },
          );
        } else {
          const delta = buildSlotBlockedSemanticDelta(fused);
          output = applySemanticDeltaRebuild(
            parentFingerprint,
            revision,
            { id: ev.id, kind: ev.kind },
            delta,
            ev.fullRebuildFallback,
            { slotConstraintFusionTrace: slotTrace },
          );
        }
        revision = output.authority?.lineage?.revision ?? revision;
        parentFingerprint = output.authority?.inputsFingerprint;
        break;
      }
      default: {
        const k = (ev as { kind?: string }).kind;
        throw new Error(`semantic-runtime: unsupported event kind ${k ?? '(missing)'}`);
      }
    }
  }

  if (!output) {
    throw new Error('semantic-runtime: no view produced');
  }
  return output;
}
