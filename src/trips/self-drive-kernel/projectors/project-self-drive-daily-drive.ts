/**
 * 产品层 daily-drive 投影 — ADR §6 / K5
 */
import type { SelfDriveContext } from '../contracts/self-drive-context.types';
import type { SelfDriveEnginesResult } from '../contracts/self-drive-engines.types';
import type { DriveAdvisory } from '../contracts/drive-advisory.types';

export const SELF_DRIVE_DAILY_DRIVE_SCHEMA =
  'tripnara.self_drive_daily_drive@v1' as const;

export type SelfDriveDailyDriveStatus =
  | 'ON_PLAN'
  | 'NEED_ATTENTION'
  | 'SUGGEST_ADJUST'
  | 'BLOCKED';

export interface SelfDriveDailyDriveProjection {
  schemaId: typeof SELF_DRIVE_DAILY_DRIVE_SCHEMA;
  localDate: string;
  status: SelfDriveDailyDriveStatus;
  drive: {
    distanceKm?: number;
    expectedDurationMin?: number;
    difficulty: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
    originLabel?: string | null;
    destinationLabel?: string | null;
  };
  criticalSegments: Array<{
    segmentId: string;
    fromLabel: string;
    toLabel: string;
    distanceKmHint?: number;
    criticalReasons: string[];
  }>;
  advisories: DriveAdvisory[];
  recommendation?: {
    action: string;
    titleZh: string;
    detailZh?: string;
    latestDeparture?: string;
  };
  executabilityVerdict: SelfDriveEnginesResult['executability']['verdict'];
  destinationPackId: string;
  countryCode: string;
}

function mapStatus(
  verdict: SelfDriveEnginesResult['executability']['verdict'],
): SelfDriveDailyDriveStatus {
  if (verdict === 'ALLOW') return 'ON_PLAN';
  if (verdict === 'NEED_CONFIRM') return 'NEED_ATTENTION';
  if (verdict === 'SUGGEST_REPLACE') return 'SUGGEST_ADJUST';
  return 'BLOCKED';
}

export function projectSelfDriveDailyDrive(
  ctx: SelfDriveContext,
  engines: SelfDriveEnginesResult,
): SelfDriveDailyDriveProjection {
  const top = engines.recovery.recommendedActions[0];
  return {
    schemaId: SELF_DRIVE_DAILY_DRIVE_SCHEMA,
    localDate: ctx.localDate,
    status: mapStatus(engines.executability.verdict),
    drive: {
      distanceKm: engines.drivingLoad.distanceKm,
      expectedDurationMin: engines.drivingLoad.expectedDurationMin,
      difficulty: engines.drivingLoad.difficulty,
      originLabel: ctx.route.originLabel,
      destinationLabel: ctx.route.destinationLabel,
    },
    criticalSegments: ctx.route.criticalSegments.map((s) => ({
      segmentId: s.segmentId,
      fromLabel: s.fromLabel,
      toLabel: s.toLabel,
      distanceKmHint: s.distanceKmHint,
      criticalReasons: s.criticalReasons,
    })),
    advisories: engines.advisories.slice(0, 6),
    recommendation: top
      ? {
          action: top.action,
          titleZh: top.titleZh,
          detailZh: top.detailZh,
        }
      : undefined,
    executabilityVerdict: engines.executability.verdict,
    destinationPackId: ctx.destinationPackId,
    countryCode: ctx.countryCode,
  };
}
