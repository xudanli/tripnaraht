/**
 * Extract observed metrics from source text / event payloads for SeverityRule evaluation.
 */

export type RiskMetricBag = Partial<Record<string, number | string | boolean>>;

/** Parse sustained wind (m/s) from Chinese/English weather copy, e.g. "16—18m/s" or "18 m/s". */
export function parseWindSustainedMps(text: string): number | undefined {
  const normalized = text.replace(/—|–|-/g, '-');
  const rangeMatch = normalized.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*m\s*\/\s*s/i);
  if (rangeMatch) {
    const hi = Number(rangeMatch[2]);
    return Number.isFinite(hi) ? hi : undefined;
  }
  const singleMatch = normalized.match(/(\d+(?:\.\d+)?)\s*m\s*\/\s*s/i);
  if (singleMatch) {
    const v = Number(singleMatch[1]);
    return Number.isFinite(v) ? v : undefined;
  }
  return undefined;
}

export function parseWindGustMps(text: string): number | undefined {
  const crosswind = text.match(/侧风[^0-9]*(\d+(?:\.\d+)?)\s*m\s*\/\s*s/i);
  if (crosswind) {
    const v = Number(crosswind[1]);
    if (Number.isFinite(v)) return v;
  }
  const gustSection = text.match(/阵风[^。；]*/)?.[0] ?? text;
  return parseWindSustainedMps(gustSection);
}

export function buildMetricsFromEnvironmentCopy(description: string): RiskMetricBag {
  const metrics: RiskMetricBag = {};
  const sustained = parseWindSustainedMps(description);
  if (sustained !== undefined) metrics.WIND_SUSTAINED_MPS = sustained;
  const gust = parseWindGustMps(description);
  if (gust !== undefined) metrics.WIND_GUST_MPS = gust;
  return metrics;
}

/** Normalize Package harness observedMetrics keys to SeverityRule metric ids. */
export function normalizeHarnessObservedMetrics(
  raw: Record<string, number | string | boolean> = {},
): RiskMetricBag {
  const out: RiskMetricBag = {};
  if (raw.windSpeedMs !== undefined) out.WIND_SUSTAINED_MPS = Number(raw.windSpeedMs);
  if (raw.windGustMs !== undefined) out.WIND_GUST_MPS = Number(raw.windGustMs);
  if (raw.precipitationMmh !== undefined) {
    out.PRECIPITATION_RATE_MMH = Number(raw.precipitationMmh);
  }
  if (raw.continuousDrivingHours !== undefined) {
    out.CONTINUOUS_DRIVING_HOURS = Number(raw.continuousDrivingHours);
  }
  if (raw.snowfallRateCmh !== undefined) out.SNOWFALL_RATE_CMH = Number(raw.snowfallRateCmh);
  if (raw.visibilityM !== undefined) out.VISIBILITY_M = Number(raw.visibilityM);
  if (raw.fuelLevelPercent !== undefined) out.FUEL_REMAINING_PERCENT = Number(raw.fuelLevelPercent);
  if (raw.detourDistanceKm !== undefined && raw.estimatedFuelRangeKm !== undefined) {
    if (Number(raw.detourDistanceKm) > Number(raw.estimatedFuelRangeKm)) {
      out.FUEL_RANGE_DEFICIT_KM = Number(raw.detourDistanceKm) - Number(raw.estimatedFuelRangeKm);
    }
  }
  if (raw.vehicleDriveType !== undefined) out.VEHICLE_DRIVE_TYPE = String(raw.vehicleDriveType);
  if (raw.roadRequiredDrive !== undefined) out.ROAD_REQUIRED_DRIVE = String(raw.roadRequiredDrive);
  if (raw.roadSurfaceCondition !== undefined) {
    out.ROAD_SURFACE_CONDITION = String(raw.roadSurfaceCondition);
  }
  if (raw.nextFerrySlot !== undefined) out.NEXT_FERRY_SLOT_OFFSET_HOURS = 24;
  return out;
}

export function roadClosureStatusMetric(status: string): string {
  if (status === 'CLOSED') return 'CLOSED_CONFIRMED';
  if (status === 'AT_RISK' || status === 'FORECAST') return 'CLOSURE_FORECAST';
  if (status === 'OPEN' || status === 'REOPENED') return 'REOPENED';
  return status;
}

export function mergeMetricBags(...bags: Array<RiskMetricBag | undefined>): RiskMetricBag {
  const out: RiskMetricBag = {};
  for (const bag of bags) {
    if (!bag) continue;
    Object.assign(out, bag);
  }
  return out;
}
