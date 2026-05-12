import type {
  ComputeFuelReachabilityInput,
  FuelPoiIndexEntry,
  FuelReachabilitySeverity,
  FuelReachabilitySummary,
  FuelRouteLegInput,
  VehicleFuelProfile,
} from './fuel-reachability.types';

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Effective one-shot range after margin and worst-case consumption blow-up. */
export function computeEffectiveRangeKm(profile: VehicleFuelProfile): number {
  const margin = clamp01(profile.safetyMarginPct);
  const worst = Math.max(1, profile.worstCaseMultiplier);
  return (profile.nominalRangeKm * (1 - margin)) / worst;
}

function findNextFuelAlongRoute(
  cumulativeKmAtLegEnd: number,
  fuelPOIs: FuelPoiIndexEntry[],
): { poi?: FuelPoiIndexEntry; kmToNext: number } {
  const withArc = fuelPOIs.filter(
    p => typeof p.arcKmAlongRoute === 'number' && Number.isFinite(p.arcKmAlongRoute),
  );
  if (withArc.length === 0) {
    return { kmToNext: 0 };
  }
  const ahead = withArc.filter(p => (p.arcKmAlongRoute as number) > cumulativeKmAtLegEnd);
  if (ahead.length === 0) {
    return { kmToNext: Number.POSITIVE_INFINITY };
  }
  let best = ahead[0]!;
  let bestDelta = (best.arcKmAlongRoute as number) - cumulativeKmAtLegEnd;
  for (const p of ahead.slice(1)) {
    const d = (p.arcKmAlongRoute as number) - cumulativeKmAtLegEnd;
    if (d < bestDelta) {
      bestDelta = d;
      best = p;
    }
  }
  return { poi: best, kmToNext: bestDelta };
}

function severityFrom(
  safe: boolean,
  remainingRangeKm: number,
): FuelReachabilitySeverity {
  if (safe) {
    return 'LOW';
  }
  if (remainingRangeKm < 30) {
    return 'CRITICAL';
  }
  if (remainingRangeKm < 80) {
    return 'HIGH';
  }
  return 'MEDIUM';
}

export function computeFuelReachability(input: ComputeFuelReachabilityInput): FuelReachabilitySummary[] {
  const effectiveRangeKm = computeEffectiveRangeKm(input.vehicleProfile);
  const fuelPOIs = input.poiIndex.filter(p => p.category === 'FUEL');

  return input.polyline.legs.map((leg: FuelRouteLegInput) => {
    const { poi, kmToNext } = findNextFuelAlongRoute(leg.cumulativeKmToLegEnd, fuelPOIs);

    const remainingRangeKm = effectiveRangeKm - leg.cumulativeKmToLegEnd;
    const safe =
      Number.isFinite(kmToNext) && Number.isFinite(remainingRangeKm)
        ? remainingRangeKm >= kmToNext
        : true;

    const severity = severityFrom(safe, remainingRangeKm);

    return {
      legId: leg.id,
      date: leg.date,
      safeBeforeNextFuel: safe,
      kmToNextFuel: kmToNext,
      kmToReachableFuel: Math.max(0, remainingRangeKm),
      remainingRangeKm,
      effectiveRangeKm,
      severity,
      recommendedStopPoiId: poi?.id,
      detourKm: poi?.detourKm,
    };
  });
}
