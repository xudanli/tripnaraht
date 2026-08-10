/**
 * 系统主动决策候选（非用户显式提问时）。
 * 例如：两驱 + F-road/高地语境 → VEHICLE_ROAD_FIT。
 */

import type { DecisionCandidate } from './decision-intake.util';
import { findOpenDecisionForTrip } from './travel-decision-store.util';
import { readTravelDecisionCommitments } from './persist-travel-decision-commit.util';

export type ProactiveDecisionContext = {
  tripId: string;
  message: string;
  /** trip.metadata 或 trip_meta */
  metadata?: unknown;
  vehicleHint?: string | null;
};

function metaVehicle(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return '';
  const m = metadata as Record<string, unknown>;
  const latest = m.travelDecisionLatest as Record<string, unknown> | undefined;
  const fromLatest = String(latest?.vehicle_drive ?? latest?.vehicle_requirement ?? '');
  const isd = m.icelandSelfDrive as Record<string, unknown> | undefined;
  const fromIsd = String(isd?.vehicleType ?? isd?.driveType ?? '');
  return `${fromLatest} ${fromIsd}`.toLowerCase();
}

/**
 * 若已有同 key 开放决策或已 Commit 同结论，则不再主动弹出。
 */
export function detectProactiveDecisionCandidate(
  ctx: ProactiveDecisionContext,
): DecisionCandidate | null {
  const msg = String(ctx.message ?? '');
  if (!msg.trim()) return null;

  const commitments = readTravelDecisionCommitments(ctx.metadata);
  const vehicle =
    `${String(ctx.vehicleHint ?? '')} ${metaVehicle(ctx.metadata)}`.toLowerCase();

  const mentionsFroadOrHighlands =
    /F\s*-?\s*road|F路|高地|Highland|Landmannalaugar|F208|F225/i.test(msg);
  const isTwoWd =
    /2wd|两驱/.test(vehicle) || /两驱|2WD/.test(msg);

  if (mentionsFroadOrHighlands && isTwoWd) {
    if (commitments?.byKey?.VEHICLE_ROAD_FIT) return null;
    if (findOpenDecisionForTrip(ctx.tripId, 'VEHICLE_ROAD_FIT')) return null;
    return {
      decisionKey: 'VEHICLE_ROAD_FIT',
      confidence: 0.9,
      reason: 'system_trigger',
    };
  }

  /** 抵达日长途：落地 + 维克/长途 */
  if (
    /落地|抵达当天|第一天/.test(msg) &&
    /维克|Vík|长途|3\.5\s*小时|开到南岸/i.test(msg)
  ) {
    if (commitments?.byKey?.ARRIVAL_DAY_LOAD) return null;
    if (findOpenDecisionForTrip(ctx.tripId, 'ARRIVAL_DAY_LOAD')) return null;
    return {
      decisionKey: 'ARRIVAL_DAY_LOAD',
      confidence: 0.85,
      reason: 'system_trigger',
    };
  }

  return null;
}
