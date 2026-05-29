/**
 * 冰岛 Alpha 投产兜底：不完整物理层门控、区域风险底噪、研究数据元数据合并
 */

import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { PhysicalRealityModel } from '../../../trips/decision/models/physical-reality.model';
import type { DemDecisionEvidence } from '../../../trips/decision/shared/world-model.types';
import type { WorldBuildContextOutput } from '../world-build-context.skill';
import type { WorldModelMeta } from '../world-model-provenance.types';

export const PLACEHOLDER_DEM_SEGMENT_ID = 'placeholder_no_plan_yet';

/** 罗弗敦意图关键词（小写匹配用户消息 / POI 名） */
const LOFOTEN_REGION_KEYWORDS = [
  'lofoten',
  'lofot',
  'reine',
  'svolvaer',
  'svolvær',
  'moskenes',
  'hamnøy',
  'hamnoy',
  '罗弗敦',
];

/**
 * 仅当显式 subregion 或文本/POI 命中罗弗敦关键词时返回 'lofoten'。
 * 奥斯陆/卑尔根等常规挪威行程返回 undefined → 不加载错位区域文件。
 */
export function resolveNorwaySubregionForWorldBuild(params: {
  countryCode?: string;
  subregion?: string;
  userMessage?: string;
  poiNames?: string[];
}): string | undefined {
  if (params.countryCode?.toUpperCase() !== 'NO') return undefined;
  const sub = params.subregion?.trim().toLowerCase();
  if (sub === 'lofoten' || sub === 'lofot') return 'lofoten';

  const haystack = [
    params.userMessage ?? '',
    ...(params.poiNames ?? []),
  ]
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  if (LOFOTEN_REGION_KEYWORDS.some((kw) => haystack.includes(kw.normalize('NFD').replace(/\p{M}/gu, '')))) {
    return 'lofoten';
  }
  return undefined;
}

export function isPlaceholderDemEvidence(ev: DemDecisionEvidence): boolean {
  return (
    ev.segmentId?.startsWith('placeholder_') === true ||
    ev.violation === 'UNKNOWN' ||
    (ev as { dataProvenance?: string }).dataProvenance === 'PLACEHOLDER'
  );
}

/** 气候/道路静态层推导的区域基础风险底噪（0–1，越高越不安全） */
export function getBaselineRegionalRiskPenalty(physical?: PhysicalRealityModel): number {
  if (!physical) return 0.22;
  const accessibility = physical.climateSeasonality?.accessibilityScore;
  if (typeof accessibility === 'number') {
    return Math.max(0.12, Math.min(0.45, 0.5 - accessibility * 0.35));
  }
  const closed = (physical.roadStates ?? []).filter((r) => r.status === 'CLOSED').length;
  const seasonal = (physical.roadStates ?? []).filter((r) => r.status === 'SEASONAL').length;
  return Math.max(0.15, Math.min(0.4, 0.18 + closed * 0.08 + seasonal * 0.04));
}

export function buildWorldModelMetaFromBuildOutput(
  output: Pick<WorldBuildContextOutput, 'world' | 'missingPieces'>,
  opts?: { countryCode?: string; dataRegion?: string; subregion?: string },
): WorldModelMeta {
  const incomplete = output.missingPieces?.physicalRealityIncomplete === true;
  const hasStaticRoads = (output.world?.physical?.roadStates?.length ?? 0) > 0;
  return {
    physicalRealityIncomplete: incomplete,
    countryCode: opts?.countryCode ?? output.world?.physical?.countryCode,
    dataRegion: opts?.dataRegion,
    subregion: opts?.subregion,
    physicalDataProvenance: incomplete
      ? 'PLACEHOLDER'
      : hasStaticRoads
        ? 'STATIC_INFERRED'
        : 'NONE',
  };
}

export function mergeWorldBuildIntoResearchData(
  researchData: Record<string, unknown>,
  output: WorldBuildContextOutput,
  meta?: WorldModelMeta,
): void {
  researchData.worldModel = output.world;
  researchData.world_build_context = { world: output.world, missingPieces: output.missingPieces };
  researchData.worldModelMeta = meta ?? buildWorldModelMetaFromBuildOutput(output);
  if (meta?.physicalRealityIncomplete) {
    researchData.physicalRealityIncomplete = true;
  }
}

export function resolvePhysicalRealityIncomplete(state: DecisionState): boolean {
  const env = state.environmentState as { physicalRealityIncomplete?: boolean } | undefined;
  if (env?.physicalRealityIncomplete === true) return true;

  const rd = state.research_data as Record<string, unknown> | undefined;
  if (!rd) return false;

  const meta = rd.worldModelMeta as WorldModelMeta | undefined;
  if (meta?.physicalRealityIncomplete === true) return true;
  if (rd.physicalRealityIncomplete === true) return true;

  const missing = (rd.world_build_context as { missingPieces?: WorldModelMeta })?.missingPieces as
    | { physicalRealityIncomplete?: boolean }
    | undefined;
  if (missing?.physicalRealityIncomplete === true) return true;

  const wm = rd.worldModel as { physical?: PhysicalRealityModel } | undefined;
  const dem = wm?.physical?.demEvidence ?? [];
  if (dem.some((e) => isPlaceholderDemEvidence(e as DemDecisionEvidence))) return true;

  return false;
}
