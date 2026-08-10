/**
 * 为 SelfDriveContext 组装 roadEvidence（K2，默认同步、无 IO）
 * CN：季节窗 Adapter 契约；IS：无 live 注入时 UNKNOWN（live 由调用方 merge）
 */
import {
  cnSeasonalRoadStatusToContract,
  resolveCnSeasonalRoadStatus,
} from '../../readiness/utils/cn-seasonal-road-status.util';
import type { RoadStatus } from '../../../data-contracts/interfaces/road-status.interface';
import type { CriticalRoadSegment } from '../contracts/self-drive-context.types';
import type { RoadStatusEvidence } from '../contracts/road-status-evidence.types';
import {
  normalizeRoadStatusEvidence,
  unknownRoadStatusEvidence,
} from './normalize-road-status-evidence';

export function buildContextRoadEvidence(input: {
  countryCode: string;
  corridorId: string | null;
  asOfDate?: string | null;
  segments: CriticalRoadSegment[];
  /** 可选：已拉取的 live RoadStatus（按 segment 或走廊级） */
  liveBySegmentId?: Record<string, RoadStatus>;
  corridorLive?: RoadStatus | null;
  nowMs?: number;
}): RoadStatusEvidence[] {
  const cc = input.countryCode.trim().toUpperCase();
  const nowMs = input.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const segmentIds =
    input.segments.length > 0
      ? input.segments.map((s) => s.segmentId)
      : [`seg:corridor:${input.corridorId ?? 'unknown'}`];

  let corridorRoad: RoadStatus | null = input.corridorLive ?? null;

  if (!corridorRoad && (cc === 'CN' || cc === 'CHN' || cc === 'CHINA')) {
    const resolved = resolveCnSeasonalRoadStatus({
      classicRouteId: input.corridorId,
      asOfDate: input.asOfDate,
    });
    corridorRoad = cnSeasonalRoadStatusToContract(resolved);
  }

  return segmentIds.map((segmentId) => {
    const live = input.liveBySegmentId?.[segmentId] ?? corridorRoad;
    if (!live) {
      return unknownRoadStatusEvidence(
        segmentId,
        cc === 'IS' ? 'road.is:not_fetched' : 'none',
        nowIso,
      );
    }
    return normalizeRoadStatusEvidence({ road: live, segmentId, nowMs });
  });
}

/** 将 RoadStatusEvidence 映回 TEP EvidenceRef */
export function roadEvidenceToEvidenceRefs(
  rows: RoadStatusEvidence[],
): Array<{
  provider: string;
  sourceType: 'OFFICIAL' | 'PARTNER' | 'USER' | 'MODEL' | 'INTERNAL';
  observedAt: string;
  validUntil?: string;
  subjectRef?: string;
  predicate: string;
  confidence: number;
  degraded: boolean;
}> {
  return rows.map((e) => ({
    provider: e.source,
    sourceType:
      e.source.includes('road.is') || e.source.includes('gagnaveita')
        ? ('OFFICIAL' as const)
        : ('INTERNAL' as const),
    observedAt: e.observedAt,
    validUntil: e.validUntil,
    subjectRef: e.segmentId,
    predicate: 'road.status',
    confidence: e.confidence,
    degraded: !e.strongJudgmentAllowed || e.freshness === 'PARTIAL',
  }));
}
