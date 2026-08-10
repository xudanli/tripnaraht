/**
 * 六 Engine 统一输出 — ADR-SELF-DRIVE-KERNEL §4 / K3
 */

import type { DriveLoadTier } from '../../tep/contracts/tep-self-drive.types';
import type { DriveAdvisory } from './drive-advisory.types';
import type { RouteUnderstandingSnapshot } from './self-drive-context.types';

export const SELF_DRIVE_ENGINES_SCHEMA = 'tripnara.self_drive_engines@v1' as const;

export type VehicleRoadFitStatus =
  | 'COMPATIBLE'
  | 'CONDITIONAL'
  | 'INCOMPATIBLE'
  | 'UNKNOWN';

export type ExecutabilityVerdict =
  | 'ALLOW'
  | 'NEED_CONFIRM'
  | 'SUGGEST_REPLACE'
  | 'BLOCK';

export type RecoveryAction =
  | 'DELAY'
  | 'DEPART_EARLIER'
  | 'REROUTE'
  | 'SHORTEN'
  | 'DROP_STOP'
  | 'CHANGE_STOP'
  | 'CHANGE_HOTEL'
  | 'STOP_DRIVING'
  | 'NEED_CONFIRM';

export interface VehicleRoadFitEngineResult {
  status: VehicleRoadFitStatus;
  /** 与 Abu 对齐的门禁 */
  gate: ExecutabilityVerdict;
  reason: string;
  detailZh: string;
  segmentId?: string;
  reasons: string[];
}

export interface RouteExecutabilityEngineResult {
  verdict: ExecutabilityVerdict;
  detailZh: string;
  drivers: string[];
}

export interface DrivingLoadEngineResult {
  tier: DriveLoadTier;
  distanceKm?: number;
  expectedDurationMin?: number;
  difficulty: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  difficultyFactors: string[];
  detailZh: string;
}

export interface RuntimeMonitorEngineResult {
  changeDetected: boolean;
  impactLevel: 'NONE' | 'SOFT' | 'HARD';
  signals: Array<{ code: string; detailZh: string }>;
}

export interface RecoveryEngineResult {
  recommendedActions: Array<{
    action: RecoveryAction;
    titleZh: string;
    detailZh?: string;
  }>;
}

export interface SelfDriveEnginesResult {
  schemaId: typeof SELF_DRIVE_ENGINES_SCHEMA;
  evaluatedAt: string;
  routeUnderstanding: RouteUnderstandingSnapshot;
  vehicleRoadFit: VehicleRoadFitEngineResult;
  executability: RouteExecutabilityEngineResult;
  drivingLoad: DrivingLoadEngineResult;
  runtimeMonitor: RuntimeMonitorEngineResult;
  recovery: RecoveryEngineResult;
  /** 供产品 daily-drive 投影复用 */
  advisories: DriveAdvisory[];
}
