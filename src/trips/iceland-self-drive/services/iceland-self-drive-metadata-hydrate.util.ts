/**
 * Lazy-hydrate icelandSelfDrive metadata for trips created via Initial Plan shell
 * that only set productLine without the full ISD blob.
 */

import type { IcelandSelfDriveTripMetadata } from '../types/iceland-self-drive.types';
import { buildInitialDrivingSettings } from './iceland-self-drive-completion.util';
import { readIcelandSelfDriveMetadata } from './iceland-self-drive-response.util';

/**
 * True when the trip should use iceland-self-drive BFF (driving-settings / bootstrap).
 * Accepts explicit productLine, and legacy IS trips that only have readiness /
 * vehicle-confirm signals (pre-productLine stamps).
 */
export function isIcelandSelfDriveProductTrip(
  rawMeta: unknown,
  destination?: string | null,
): boolean {
  if (!rawMeta || typeof rawMeta !== 'object') return false;
  const meta = rawMeta as Record<string, unknown>;
  if (meta.productLine === 'iceland_self_drive') return true;
  const isd = meta.icelandSelfDrive;
  if (isd && typeof isd === 'object' && !Array.isArray(isd)) {
    const blob = isd as Record<string, unknown>;
    if (blob.productLine === 'iceland_self_drive') return true;
    if (blob.drivingSettings && typeof blob.drivingSettings === 'object') return true;
  }
  // Legacy: readiness / confirm stamps without productLine
  if (meta.selfDriveReadiness && typeof meta.selfDriveReadiness === 'object') {
    return true;
  }
  if (meta.vehicleConfirmedAt || meta.insuranceConfirmedAt) return true;

  const dest = (destination ?? '').trim().toUpperCase();
  const isIceland = dest === 'IS' || dest === 'ICELAND' || /冰岛/.test(destination ?? '');
  if (isIceland) {
    const constraints = meta.constraints;
    if (
      constraints &&
      typeof constraints === 'object' &&
      !Array.isArray(constraints) &&
      ('vehicleType' in constraints ||
        'vehicle_type' in constraints ||
        'fRoadAllowed' in constraints)
    ) {
      return true;
    }
  }
  return false;
}

function toYmd(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  return null;
}

export function bootstrapIcelandSelfDriveMetadata(input: {
  tripId: string;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  destination?: string | null;
  existingMeta?: unknown;
}): IcelandSelfDriveTripMetadata {
  const existing = readIcelandSelfDriveMetadata(input.existingMeta);
  if (existing) return existing;

  const start =
    toYmd(input.startDate) ??
    new Date().toISOString().slice(0, 10);
  const end = toYmd(input.endDate) ?? start;
  const now = new Date().toISOString();

  return {
    productLine: 'iceland_self_drive',
    idempotencyKey: `hydrate_${input.tripId}`,
    contextVersion: `cv_hydrate_${Date.now()}`,
    wizard: {
      destinationCode: 'IS',
      productLine: 'iceland_self_drive',
      dateRange: { startDate: start, endDate: end },
      arrivalAt: null,
      departureAt: null,
      travelerCount: 2,
      startLocationCode: 'keflavik',
      endLocationCode: 'keflavik',
      endSameAsStart: true,
      vehicleAcquisition: 'rent',
      regionIds: ['south_coast'],
      bookings: [],
      skipBookings: true,
      fillBookingsLater: false,
    },
    drivingSettings: buildInitialDrivingSettings('rent'),
    routeSkeleton: {
      strategyId: 'hydrated-from-product-line',
      regionSummary: input.destination === 'IS' ? '冰岛' : '冰岛自驾',
      days: [],
    },
    hardAnchors: [],
    warnings: [
      {
        code: 'ISD_METADATA_HYDRATED',
        message: '已从 productLine 补齐自驾设置元数据（Initial Plan 行程）',
      },
    ],
    createdAt: now,
    generationStatus: 'READY',
    lastEvents: [
      {
        type: 'trip_context_changed',
        at: now,
        message: 'hydrate_iceland_self_drive_metadata',
      },
    ],
  };
}
