/**
 * 行中 / 总览统一建议投影 — ADR-SELF-DRIVE-KERNEL §5
 * 前端不感知 ChinaAltitudeRisk / IcelandWindRisk 等国家类型名。
 */

export type DriveAdvisoryType =
  | 'WEATHER'
  | 'ROAD_ACCESS'
  | 'VEHICLE_FIT'
  | 'ALTITUDE'
  | 'RESTRICTION'
  | 'FERRY'
  | 'CHECKPOINT'
  | 'FUEL'
  | 'FATIGUE'
  | 'SEASONAL'
  | 'OTHER';

export type DriveAdvisorySeverity = 'INFO' | 'WARNING' | 'BLOCK';

export interface DriveAdvisory {
  type: DriveAdvisoryType;
  severity: DriveAdvisorySeverity;
  titleZh: string;
  summaryZh: string;
  affectedSegmentId?: string;
  validWindow?: { fromLocal?: string; toLocal?: string };
  recommendation?: { action: string; detailZh?: string };
  /** 机器可读来源（审计用，非 UI） */
  sourceCode?: string;
}
