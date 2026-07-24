/**
 * route_and_run `explain.world_model_guards`：从 DSO 投影物理不完整 / 路由拓扑锁（前端 BFF 只读）
 */

import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { WorldModelMeta } from '../../skills/world/world-model-provenance.types';

export type WorldModelGuardsSegmentEditorMode = 'full' | 'slot_timing_only' | 'readonly';

/** 与 RouteAndRunResponseDto.explain.world_model_guards 对齐 */
export interface WorldModelGuardsExplain {
  physical_reality_incomplete?: boolean;
  physical_data_region?: string;
  is_route_topology_locked?: boolean;
  route_skeleton_locked?: boolean;
  locked_segment_ids?: string[];
  route_skeleton_signature?: string;
  freeze_route_selection?: boolean;
  topology_match?: boolean;
  recommended_plan_rejected?: boolean;
  segment_editor_mode?: WorldModelGuardsSegmentEditorMode;
  banner_message_zh?: string;
}

function readMeta(
  decisionState: DecisionState | undefined,
  researchDataFallback?: Record<string, unknown>,
): WorldModelMeta | undefined {
  const fromDso = decisionState?.research_data?.worldModelMeta as WorldModelMeta | undefined;
  if (fromDso) return fromDso;
  return researchDataFallback?.worldModelMeta as WorldModelMeta | undefined;
}

function deriveSegmentEditorMode(
  physicalIncomplete: boolean,
  topologyLocked: boolean,
): WorldModelGuardsSegmentEditorMode {
  if (topologyLocked) return 'slot_timing_only';
  if (physicalIncomplete) return 'readonly';
  return 'full';
}

function deriveBannerZh(
  physicalIncomplete: boolean,
  topologyLocked: boolean,
  recommendedRejected?: boolean,
): string | undefined {
  if (topologyLocked) {
    const base = '路线骨架已锁定，仅可调整各站停留时间，不可拖拽改线或删除路段。';
    return recommendedRejected
      ? `${base}（推荐方案因拓扑不一致未应用，已保留当前行程。）`
      : base;
  }
  if (physicalIncomplete) {
    return '物理数据为草稿/占位，路线优化已降级，正式 DEM 上线后可能调整。';
  }
  return undefined;
}

/**
 * 从 DSO（及可选 orchestrator research_data 兜底）构建 world_model_guards。
 * 无有效信号时返回 undefined。
 */
export function projectWorldModelGuardsExplain(
  decisionState?: DecisionState,
  researchDataFallback?: Record<string, unknown>,
): WorldModelGuardsExplain | undefined {
  const meta = readMeta(decisionState, researchDataFallback);
  const rd = (decisionState?.research_data ?? researchDataFallback) as Record<string, unknown> | undefined;
  const env = decisionState?.environmentState;
  const lock =
    decisionState?.tripState?.routeTopologyLock ??
    env?.routeTopologyLock;

  const physicalIncomplete =
    env?.physicalRealityIncomplete === true ||
    meta?.physicalRealityIncomplete === true ||
    rd?.physicalRealityIncomplete === true;

  const topologyLocked =
    env?.isRouteTopologyLocked === true ||
    meta?.isRouteTopologyLocked === true ||
    meta?.route_skeleton_locked === true ||
    lock?.route_skeleton_locked === true;

  const lockedSegmentIds =
    (lock?.lockedSegmentIds?.length ? lock.lockedSegmentIds : undefined) ??
    (meta?.lockedSegmentIds?.length ? meta.lockedSegmentIds : undefined);

  const routeSkeletonSignature =
    lock?.routeSkeletonSignature ?? meta?.routeSkeletonSignature;

  const freezeRouteSelection =
    decisionState?.optimizationHints?.optimizationFlags?.freezeRouteSelection === true;

  const physicalDataRegion =
    (typeof meta?.dataRegion === 'string' && meta.dataRegion) ||
    (typeof env?.physicalDataRegion === 'string' && env.physicalDataRegion) ||
    undefined;

  const topologyMatch = lock?.topologyMatch;
  const recommendedPlanRejected = lock?.recommendedPlanRejected;

  const meaningful =
    physicalIncomplete ||
    topologyLocked ||
    freezeRouteSelection ||
    (lockedSegmentIds && lockedSegmentIds.length > 0) ||
    !!routeSkeletonSignature ||
    recommendedPlanRejected === true;

  if (!meaningful) return undefined;

  const segment_editor_mode = deriveSegmentEditorMode(physicalIncomplete, topologyLocked);
  const banner_message_zh = deriveBannerZh(
    physicalIncomplete,
    topologyLocked,
    recommendedPlanRejected,
  );

  const row: WorldModelGuardsExplain = {};
  if (physicalIncomplete) row.physical_reality_incomplete = true;
  if (physicalDataRegion) row.physical_data_region = physicalDataRegion;
  if (topologyLocked) {
    row.is_route_topology_locked = true;
    row.route_skeleton_locked = true;
  }
  if (lockedSegmentIds?.length) row.locked_segment_ids = [...lockedSegmentIds];
  if (routeSkeletonSignature) row.route_skeleton_signature = routeSkeletonSignature;
  if (freezeRouteSelection) row.freeze_route_selection = true;
  if (topologyMatch !== undefined) row.topology_match = topologyMatch;
  if (recommendedPlanRejected === true) row.recommended_plan_rejected = true;
  row.segment_editor_mode = segment_editor_mode;
  if (banner_message_zh) row.banner_message_zh = banner_message_zh;

  return row;
}
