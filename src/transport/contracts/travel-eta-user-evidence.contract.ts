/**
 * Frozen user-facing evidence projection for Web / iOS (ETA-L2-CANARY-01).
 * UI may lag; semantics must not invent “longer drive” for CLOSED / vehicle mismatch.
 */

import type { TravelEtaEnvelopeV1 } from './travel-eta.contract';

export const TRAVEL_ETA_USER_EVIDENCE_SCHEMA = 'tripnara/travel-eta-user-evidence/v1' as const;

export type TravelEtaUserEvidenceKind = 'SCHEDULABLE_ETA' | 'ROUTE_BLOCKED';

export interface TravelEtaUserEvidenceV1 {
  schema: typeof TRAVEL_ETA_USER_EVIDENCE_SCHEMA;
  kind: TravelEtaUserEvidenceKind;

  /** 基础预计车程 */
  baseDurationLabel: string;
  /** 建议预留（planning）— only when SCHEDULABLE */
  planningDurationLabel?: string;
  /** 额外预留 = planning − base */
  extraBufferLabel?: string;

  reasonBullets: string[];
  confidenceLabel: '高' | '中' | '低' | '未知';

  /** Blocked copy — never frame as “车程较长” */
  blockedTitle?: string;
  blockedDetail?: string;
  suggestedAction?: string;
}

function formatDurationMin(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h <= 0) return `${r}分钟`;
  if (r === 0) return `${h}小时`;
  return `${h}小时${r.toString().padStart(2, '0')}分`;
}

function confidenceLabel(c: number): TravelEtaUserEvidenceV1['confidenceLabel'] {
  if (!Number.isFinite(c)) return '未知';
  if (c >= 0.8) return '高';
  if (c >= 0.55) return '中';
  return '低';
}

function reasonBulletsFromEta(eta: TravelEtaEnvelopeV1): string[] {
  const bullets: string[] = [];
  const reasons = new Set(eta.adjustmentReasons ?? []);
  if (reasons.has('F_ROAD') || reasons.has('UNPAVED_ROAD')) {
    bullets.push('高地非铺装道路');
  }
  if (reasons.has('SEASONAL_UNCERTAINTY') || reasons.has('DATA_UNCERTAINTY')) {
    bullets.push('路况不确定性较高');
  }
  if (reasons.has('STEEP_TERRAIN') || reasons.has('TERRAIN_COMPLEXITY')) {
    bullets.push('路线包含明显地形起伏');
  }
  if (reasons.has('SAFETY_BUFFER') || reasons.has('PARKING_BUFFER') || reasons.has('PARKING_WALK_BUFFER')) {
    bullets.push('含停车 / 接驳安全缓冲');
  }
  if (bullets.length === 0 && (eta.planningDurationMin ?? 0) > eta.baseDurationMin) {
    bullets.push('已按规划规则增加预留时间');
  }
  return bullets;
}

/**
 * Project envelope → user copy. CLOSED / 2WD → ROUTE_BLOCKED, not longer ETA.
 */
export function projectTravelEtaUserEvidence(eta: TravelEtaEnvelopeV1): TravelEtaUserEvidenceV1 {
  const blocked =
    eta.schedulability === 'BLOCKED' ||
    (eta.gateReasons?.length ?? 0) > 0 &&
      eta.gateReasons!.some((r) =>
        /CLOSED|2WD|FROAD_2WD|E_DEM_MISSING|VEHICLE/i.test(r),
      );

  if (blocked) {
    const gates = eta.gateReasons ?? [];
    const vehicle = gates.some((r) => /2WD|VEHICLE|FROAD_2WD/i.test(r));
    const closed = gates.some((r) => /CLOSED/i.test(r));
    return {
      schema: TRAVEL_ETA_USER_EVIDENCE_SCHEMA,
      kind: 'ROUTE_BLOCKED',
      baseDurationLabel: formatDurationMin(eta.baseDurationMin),
      reasonBullets: gates,
      confidenceLabel: confidenceLabel(eta.confidence),
      blockedTitle: '当前路线不可按计划执行',
      blockedDetail: vehicle
        ? '车型不符合 F 路要求'
        : closed
          ? '道路当前不可通行'
          : '缺少必要路线证据或准入条件不满足',
      suggestedAction: vehicle
        ? '更换 4WD 或采用替代路线'
        : closed
          ? '选择替代路线或改期'
          : '补充车型 / 地形证据后重试',
    };
  }

  const extra = Math.max(0, eta.planningDurationMin - eta.baseDurationMin);
  return {
    schema: TRAVEL_ETA_USER_EVIDENCE_SCHEMA,
    kind: 'SCHEDULABLE_ETA',
    baseDurationLabel: formatDurationMin(eta.baseDurationMin),
    planningDurationLabel: formatDurationMin(eta.planningDurationMin),
    extraBufferLabel: extra > 0 ? formatDurationMin(extra) : undefined,
    reasonBullets: reasonBulletsFromEta(eta),
    confidenceLabel: confidenceLabel(eta.confidence),
  };
}
