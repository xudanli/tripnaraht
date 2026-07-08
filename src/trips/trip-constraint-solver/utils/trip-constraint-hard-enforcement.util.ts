/**
 * 硬约束 enforce SSOT — 与 BFF judgmentRule 同源（读 metadata / budget / pacing 存量字段）
 */

import {
  isSelfDriveTrip,
  readUserMaxDailyDrivingHours,
  resolveMaxDailyDrivingHours,
  resolveNoNightDrivePolicy,
  type NoNightDrivePolicy,
} from './daily-drive-threshold.util';

export interface TripHardConstraintEnforcement {
  maxDailyDrivingHours?: number;
  noNightDrive?: NoNightDrivePolicy;
  budgetTotal?: { total: number; currency: string };
}

export function resolveTripHardConstraintEnforcement(input: {
  metadata: unknown;
  pacingConfig: unknown;
  budgetTotal?: number | null;
  budgetCurrency?: string | null;
}): TripHardConstraintEnforcement {
  const out: TripHardConstraintEnforcement = {};

  if (isSelfDriveTrip(input.pacingConfig) && readUserMaxDailyDrivingHours(input.metadata) != null) {
    const resolved = resolveMaxDailyDrivingHours({
      metadata: input.metadata,
      pacingConfig: input.pacingConfig,
      allowPacingDefault: false,
    });
    if (resolved) out.maxDailyDrivingHours = resolved.maxDailyDrivingHours;
  }

  const noNight = resolveNoNightDrivePolicy(input.metadata, input.pacingConfig);
  if (noNight) out.noNightDrive = noNight;

  if (input.budgetTotal != null && Number.isFinite(input.budgetTotal)) {
    out.budgetTotal = {
      total: input.budgetTotal,
      currency: input.budgetCurrency ?? 'CNY',
    };
  }

  return out;
}
