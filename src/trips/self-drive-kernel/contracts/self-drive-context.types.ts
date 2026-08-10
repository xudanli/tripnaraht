/**
 * SelfDriveContext — ADR-SELF-DRIVE-KERNEL §1
 * 行程级统一自驾上下文；内嵌复用 TEP Profile，不替换 TEP。
 */

import type {
  DriverProfile,
  EvidenceRef,
  SelfDriveProfile,
  VehicleProfile,
} from '../../tep/contracts/tep-self-drive.types';
import type { DestinationSelfDriveCapabilities } from './destination-self-drive-capabilities.types';
import type { DriveAdvisory } from './drive-advisory.types';
import type { RoadStatusEvidence } from './road-status-evidence.types';

export const SELF_DRIVE_CONTEXT_SCHEMA = 'tripnara.self_drive_context@v1' as const;

export type CriticalSegmentReason =
  | 'LONG_DAY'
  | 'ALTITUDE'
  | 'SEASONAL'
  | 'F_ROAD'
  | 'FORD'
  | 'RESTRICTED_AREA'
  | 'CHECKPOINT'
  | 'NOTES_HAZARD'
  | 'HIGH_SEVERITY_ROUTE';

/** 走廊内的一日/一段驾驶单位（经典线骨架分解结果） */
export interface CriticalRoadSegment {
  segmentId: string;
  corridorId: string | null;
  dayIndex: number;
  fromLabel: string;
  toLabel: string;
  distanceKmHint?: number;
  isCritical: boolean;
  criticalReasons: CriticalSegmentReason[];
  /** 指向 Destination Pack RoadSegmentProfile（若已有） */
  profileRef?: { roadId?: string; segmentId?: string };
  notesZh?: string;
}

export interface RouteUnderstandingSnapshot {
  corridorId: string | null;
  corridorNameZh: string | null;
  variantId: string | null;
  dayIndex: number;
  originLabel: string | null;
  destinationLabel: string | null;
  segments: CriticalRoadSegment[];
  criticalSegments: CriticalRoadSegment[];
}

export interface RoadConditionSlice {
  /** 归一后的路况摘要；非准实时时 freshness 偏低 */
  status: 'OPEN' | 'RESTRICTED' | 'DIFFICULT' | 'CLOSED' | 'UNKNOWN';
  riskLevel?: number;
  reasonZh?: string;
  source?: string;
  evidenceGrade?: string;
}

export interface EnvironmentSlice {
  requiresAltitudeAcclimatization?: boolean;
  seasonWindowIds?: string[];
}

export interface RegulationSlice {
  checkpointLikely?: boolean;
  cityLimitCities?: string[];
  etcRecommended?: boolean;
  rentalRestrictionCodes?: string[];
  wantsRestrictedRegion?: boolean;
}

export interface TripExecutionSlice {
  productLine?: string | null;
  isSelfDrive: boolean;
  /** 预留：lifecycle 由 drive-session / overview 注入 */
  lifecycle?: string;
}

export interface ResourceSlice {
  drivingThresholdPackCode?: string | null;
  warnSegmentDistanceKm?: number;
  maxSegmentDistanceKm?: number;
}

export interface SelfDriveContext {
  schemaId: typeof SELF_DRIVE_CONTEXT_SCHEMA;
  tripId: string;
  localDate: string;
  timezone: string;
  destinationPackId: string;
  countryCode: string;
  capabilities: DestinationSelfDriveCapabilities;
  /** TEP 归一 profile */
  profile: SelfDriveProfile;
  vehicle: VehicleProfile;
  driver: DriverProfile[];
  route: RouteUnderstandingSnapshot;
  roadConditions: RoadConditionSlice;
  environment: EnvironmentSlice;
  regulations: RegulationSlice;
  tripExecution: TripExecutionSlice;
  resources: ResourceSlice;
  /** K1：由 Pack/metadata 投影的初版 advisories（Engine 之后会再精炼） */
  advisories: DriveAdvisory[];
  /** K2：归一路况证据（segment 级） */
  roadEvidence: RoadStatusEvidence[];
  /** TEP 兼容 EvidenceRef（由 roadEvidence 派生） */
  evidence: EvidenceRef[];
  builtAt: string;
}
