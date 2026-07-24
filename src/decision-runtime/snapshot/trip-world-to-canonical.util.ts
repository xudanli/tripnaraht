/**
 * TripWorldState → CanonicalWorldStateSnapshot materialization.
 */

import type { TripWorldState } from '../../trips/decision/world-model';
import type { TripPlan } from '../../trips/decision/plan-model';
import type {
  CanonicalWorldStateSnapshot,
  FerryState,
  HazardState,
  PoiOperationalState,
  RoadState,
  WeatherState,
} from '../contracts/world-state-snapshot';
import {
  evaluateWorldStateCompleteness,
} from '../constraints/world-state/completeness-evaluator.util';
import { auditPlanPoiIdentity } from '../constraints/world-state/plan-poi-identity.util';
import type { WorldStateDataAvailability } from '../constraints/contracts/world-state-completeness';

export function tripWorldStateToCanonicalSnapshot(input: {
  tripId: string;
  snapshotId: string;
  revision: string;
  worldState: TripWorldState;
  plan?: TripPlan;
  dataAvailability?: WorldStateDataAvailability;
  assertionIds?: string[];
}): CanonicalWorldStateSnapshot {
  const physical = (input.worldState as { physical?: Record<string, unknown> }).physical ?? {};
  const signals = (input.worldState.signals ?? {}) as unknown as Record<string, unknown>;
  const weatherByDate =
    (signals.weatherByDate as Record<string, Record<string, unknown>> | undefined) ?? {};

  const roads = mapRoadStates(physical.roadStates);
  const hazards = mapHazardStates(physical.hazardZones);
  const ferries = mapFerryStates(physical.ferryStates);
  const weather = mapWeatherStates(weatherByDate);

  const completeness = evaluateWorldStateCompleteness({
    worldState: input.worldState,
    plan: input.plan,
    dataAvailability: input.dataAvailability,
  });

  const poiAudit = input.plan ? auditPlanPoiIdentity(input.plan, 'IS') : null;
  const poiStates: PoiOperationalState[] = (poiAudit?.canonicalPoiIds ?? []).map(
    (poiId) => ({
      poiId,
      sourceRef: 'cpre:iceland-registry@v1',
    }),
  );

  return {
    schemaId: 'tripnara.canonical_world_state_snapshot@v1',
    snapshotId: input.snapshotId,
    tripId: input.tripId,
    revision: input.revision,
    createdAt: new Date().toISOString(),
    weather,
    roads,
    hazards,
    ferries,
    poiStates,
    travelMatrix: { matrixId: `matrix_${input.snapshotId}`, entries: [] },
    completeness,
    sourceVersions: [
      {
        provider: 'trip-world-state',
        version: '0.1.0',
        observedAt: (signals.lastUpdatedAt as string | undefined) ?? new Date().toISOString(),
      },
    ],
    assertionIds: input.assertionIds,
  };
}

export function computeDataCompletenessScore(
  completeness: CanonicalWorldStateSnapshot['completeness'],
): number {
  const levels = Object.values(completeness);
  const scoreFor = (level: string) =>
    level === 'COMPLETE' ? 1 : level === 'PARTIAL' ? 0.5 : 0;
  if (levels.length === 0) return 0;
  return levels.reduce((sum, l) => sum + scoreFor(l), 0) / levels.length;
}

function mapRoadStates(raw: unknown): RoadState[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, idx) => {
    const row = item as Record<string, unknown>;
    const statusRaw = String(row.status ?? row.state ?? 'UNKNOWN').toUpperCase();
    const status =
      statusRaw === 'OPEN' || statusRaw === 'CLOSED' || statusRaw === 'RESTRICTED'
        ? statusRaw
        : 'UNKNOWN';
    return {
      roadId: String(row.roadId ?? row.id ?? `road_${idx}`),
      segmentId: row.segmentId ? String(row.segmentId) : undefined,
      status: status as RoadState['status'],
      reasonCode: row.reasonCode ? String(row.reasonCode) : undefined,
      sourceRef: row.sourceRef ? String(row.sourceRef) : undefined,
    };
  });
}

function mapHazardStates(raw: unknown): HazardState[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, idx) => {
    const row = item as Record<string, unknown>;
    return {
      hazardId: String(row.hazardId ?? row.id ?? `hazard_${idx}`),
      type: String(row.type ?? 'unknown'),
      severity: row.severity ? String(row.severity) : undefined,
      sourceRef: row.sourceRef ? String(row.sourceRef) : undefined,
    };
  });
}

function mapFerryStates(raw: unknown): FerryState[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, idx) => {
    const row = item as Record<string, unknown>;
    const statusRaw = String(row.status ?? 'UNKNOWN').toUpperCase();
    const status =
      statusRaw === 'OPERATING' ||
      statusRaw === 'CANCELLED' ||
      statusRaw === 'DELAYED'
        ? statusRaw
        : 'UNKNOWN';
    return {
      ferryId: String(row.ferryId ?? row.id ?? `ferry_${idx}`),
      routeId: row.routeId ? String(row.routeId) : undefined,
      status: status as FerryState['status'],
      sourceRef: row.sourceRef ? String(row.sourceRef) : undefined,
    };
  });
}

function mapWeatherStates(
  weatherByDate: Record<string, Record<string, unknown>>,
): WeatherState[] {
  return Object.entries(weatherByDate).map(([date, row]) => ({
    date,
    locationId: row.regionId ? String(row.regionId) : undefined,
    condition: row.condition ? String(row.condition) : undefined,
    alertLevel: row.alertLevel ? String(row.alertLevel) : undefined,
    sourceRef: row.sourceRef ? String(row.sourceRef) : undefined,
  }));
}
