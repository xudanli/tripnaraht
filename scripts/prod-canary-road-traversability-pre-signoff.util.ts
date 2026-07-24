/**
 * Shared helpers for Road Traversability T2 Pre-Signoff Drill.
 */

import {
  VEHICLE_PROFILES,
  type VehicleProfileId,
} from './prod-canary-road-traversability-pre-signoff.constants';
import {
  AcceptanceCheck,
  applyRoadDrillEnv,
  arg,
  assertProdDatabase,
  buildProdHarnessStack,
  fixtureSha256,
  newReplayRequestId,
  roadBindings,
  roadSegmentId,
  shellSafe,
  readWeatherSoakSnapshot,
  today,
  evidencePath,
} from './prod-canary-road-pre-signoff.util';

export {
  applyRoadDrillEnv,
  arg,
  assertProdDatabase,
  buildProdHarnessStack,
  fixtureSha256,
  newReplayRequestId,
  roadBindings,
  roadSegmentId,
  shellSafe,
  readWeatherSoakSnapshot,
  today,
  evidencePath,
};

export type TraversabilityAcceptanceCheck = AcceptanceCheck & {
  /** Excluded from structural verdict until T1 assessor + Abu LIMITED branch ship. */
  t1Pending?: boolean;
  scenarioId?: string;
};

export function parseVehicleProfile(): VehicleProfileId {
  const raw = (arg('vehicle', '2WD') ?? '2WD').toUpperCase();
  if (raw === '4WD') return '4WD';
  return '2WD';
}

export function vehicleCapability(profile: VehicleProfileId) {
  return VEHICLE_PROFILES[profile];
}

export function summarizeStructuralChecks(
  checks: TraversabilityAcceptanceCheck[],
): boolean {
  return checks.filter((c) => !c.t1Pending).every((c) => c.pass);
}

export function countT1Pending(checks: TraversabilityAcceptanceCheck[]): number {
  return checks.filter((c) => c.t1Pending).length;
}
