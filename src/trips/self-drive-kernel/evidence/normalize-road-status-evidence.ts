/**
 * RoadStatus（data-contracts）→ RoadStatusEvidence（Kernel）
 */
import type { RoadStatus } from '../../../data-contracts/interfaces/road-status.interface';
import type {
  RoadAccessStatus,
  RoadEvidenceFreshness,
  RoadStatusEvidence,
} from '../contracts/road-status-evidence.types';

const LIVE_TTL_MS = 2 * 60 * 60 * 1000;
const SEASONAL_TTL_MS = 24 * 60 * 60 * 1000;

function toIso(date: Date | string | undefined, fallback: string): string {
  if (!date) return fallback;
  if (date instanceof Date) return date.toISOString();
  const t = Date.parse(String(date));
  return Number.isFinite(t) ? new Date(t).toISOString() : fallback;
}

function isSeasonalOrPartial(road: RoadStatus): boolean {
  const meta = road.metadata ?? {};
  if (meta.realtime === false) return true;
  const grade = String(meta.evidenceGrade ?? '').toLowerCase();
  if (grade.includes('seasonal') || grade === 'seasonal_static') return true;
  const src = String(road.source ?? '').toLowerCase();
  return src.includes('seasonal') || src.includes('cn.seasonal');
}

export function mapRoadStatusToAccessStatus(road: RoadStatus): RoadAccessStatus {
  const metaStatus = String(road.metadata?.roadStatus ?? '').toUpperCase();
  if (
    metaStatus === 'OPEN' ||
    metaStatus === 'CLOSED' ||
    metaStatus === 'DIFFICULT' ||
    metaStatus === 'RESTRICTED' ||
    metaStatus === 'UNKNOWN'
  ) {
    return metaStatus as RoadAccessStatus;
  }
  if (!road.isOpen) return 'CLOSED';
  if (road.riskLevel >= 3) return 'DIFFICULT';
  if (road.riskLevel >= 2) return 'RESTRICTED';
  if (road.riskLevel >= 1) return 'RESTRICTED';
  return 'OPEN';
}

function computeConfidence(road: RoadStatus, seasonal: boolean): number {
  if (seasonal) return 0.55;
  const meta = road.metadata ?? {};
  if (meta.networkError) return 0.35;
  if (road.source === 'road.is' || String(road.source).includes('gagnaveita')) return 0.88;
  if (road.source === 'default') return 0.45;
  return 0.7;
}

function clockFreshness(
  observedAt: string,
  validUntil: string | undefined,
  nowMs: number,
): Exclude<RoadEvidenceFreshness, 'PARTIAL'> {
  const obs = Date.parse(observedAt);
  if (!Number.isFinite(obs)) return 'UNKNOWN';
  if (validUntil) {
    const until = Date.parse(validUntil);
    if (Number.isFinite(until) && nowMs > until) return 'EXPIRED';
  }
  const age = nowMs - obs;
  if (age > LIVE_TTL_MS * 2) return 'STALE';
  if (age < 0) return 'UNKNOWN';
  return 'FRESH';
}

/**
 * 将任意国家 Adapter 的 RoadStatus 归一为 Kernel 证据。
 * CN 季节窗 → freshness=PARTIAL 且 strongJudgmentAllowed=false。
 */
export function normalizeRoadStatusEvidence(input: {
  road: RoadStatus;
  segmentId: string;
  nowMs?: number;
}): RoadStatusEvidence {
  const nowMs = input.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const seasonal = isSeasonalOrPartial(input.road);
  const observedAt = toIso(input.road.lastUpdated, nowIso);
  const ttl = seasonal ? SEASONAL_TTL_MS : LIVE_TTL_MS;
  const validUntil = new Date(Date.parse(observedAt) + ttl).toISOString();
  const clock = clockFreshness(observedAt, validUntil, nowMs);
  const freshness: RoadEvidenceFreshness = seasonal ? 'PARTIAL' : clock;
  const confidence = computeConfidence(input.road, seasonal);
  const status = mapRoadStatusToAccessStatus(input.road);

  return {
    segmentId: input.segmentId,
    status,
    observedAt,
    validUntil,
    source: input.road.source,
    confidence,
    freshness,
    strongJudgmentAllowed: !seasonal && freshness === 'FRESH' && confidence >= 0.7,
    riskLevel: input.road.riskLevel,
    reasonZh: input.road.reason,
    evidenceGrade: seasonal
      ? String(input.road.metadata?.evidenceGrade ?? 'seasonal_static')
      : typeof input.road.metadata?.evidenceGrade === 'string'
        ? input.road.metadata.evidenceGrade
        : undefined,
  };
}

/** 无 live 源时的占位证据 */
export function unknownRoadStatusEvidence(
  segmentId: string,
  source = 'none',
  nowIso = new Date().toISOString(),
): RoadStatusEvidence {
  return {
    segmentId,
    status: 'UNKNOWN',
    observedAt: nowIso,
    source,
    confidence: 0,
    freshness: 'UNKNOWN',
    strongJudgmentAllowed: false,
  };
}
