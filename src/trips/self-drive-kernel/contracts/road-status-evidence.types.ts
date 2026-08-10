/**
 * 统一路况证据 — ADR-SELF-DRIVE-KERNEL §2.2 / K2
 * Kernel 只读此形状；国家 Adapter 负责填充。
 */

export type RoadAccessStatus =
  | 'OPEN'
  | 'RESTRICTED'
  | 'DIFFICULT'
  | 'CLOSED'
  | 'UNKNOWN';

/**
 * PARTIAL = 半静态/季节顾问等，不可支撑强阻断（与 capability road_status=PARTIAL 对齐）
 */
export type RoadEvidenceFreshness =
  | 'FRESH'
  | 'STALE'
  | 'EXPIRED'
  | 'PARTIAL'
  | 'UNKNOWN';

export interface RoadStatusEvidence {
  segmentId: string;
  status: RoadAccessStatus;
  observedAt: string;
  validUntil?: string;
  source: string;
  confidence: number;
  freshness: RoadEvidenceFreshness;
  /** false 时不得用于 BLOCK 级裁决 */
  strongJudgmentAllowed: boolean;
  riskLevel?: 0 | 1 | 2 | 3;
  reasonZh?: string;
  /** 原始 Adapter metadata 摘录（审计） */
  evidenceGrade?: string;
}
