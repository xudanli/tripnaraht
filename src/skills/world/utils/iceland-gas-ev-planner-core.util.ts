import { normalizeFeasibilityRegion } from './iceland-feasibility-regions.util';
import type { IcelandPlannerVehicleClass, IcelandVehicleEnergyBaseline } from './iceland-energy-baseline.util';
import { usableBatteryKwh, usableTankLiters } from './iceland-energy-baseline.util';

export interface IcelandEnergyStationRecord {
  id: string;
  name: string;
  kind: 'gas' | 'ev' | 'hybrid';
  lat: number;
  lng: number;
  region_preset: string;
  corridor_tags: string[];
  notes?: string;
}

export interface IcelandEnergyStationsPack {
  schema_version: string;
  stations: IcelandEnergyStationRecord[];
  supply_desert_tags: Record<string, { relative_risk: string; rationale: string }>;
}

export interface GasEvPlannerSegment {
  from_region: string;
  to_region: string;
}

export interface RecommendedEnergyStop {
  station_id: string;
  name: string;
  kind: string;
  match_reason: string;
}

export interface IcelandGasEvPlannerCoreResult {
  feasible: boolean;
  refuel_or_charge_required: boolean;
  critical_segment?: string;
  must_refill_before?: { station_id: string; warning: string };
  recommended_stops: RecommendedEnergyStop[];
  safety_alerts: string[];
  metrics: {
    energy_mode: 'ice' | 'ev';
    vehicle_class: IcelandPlannerVehicleClass;
    total_km: number;
    estimated_consumption_l_or_kwh: number;
    usable_capacity_l_or_kwh: number;
    nominal_range_km: number;
    range_anxiety_threshold_km: number;
  };
}

const RANGE_ANXIETY_FRACTION = 0.7;

function regionSet(segments: GasEvPlannerSegment[]): Set<string> {
  const s = new Set<string>();
  for (const seg of segments) {
    const a = normalizeFeasibilityRegion(seg.from_region);
    const b = normalizeFeasibilityRegion(seg.to_region);
    if (a) s.add(a);
    if (b) s.add(b);
  }
  return s;
}

/** 由区域组合推导走廊标签，用于与 stations.corridor_tags 碰撞 */
export function routeCorridorTagsForSegments(segments: GasEvPlannerSegment[]): Set<string> {
  const tags = new Set<string>(['ring_1']);
  const regs = regionSet(segments);
  if (regs.has('vik') || regs.has('hofn')) {
    tags.add('south_coast');
    tags.add('ring_1');
  }
  if (regs.has('egilsstadir') || regs.has('hofn')) {
    tags.add('eastfjords');
    tags.add('long_span_east');
  }
  if (regs.has('isafjordur') || regs.has('patreksfjordur') || regs.has('holmavik')) {
    tags.add('westfjords');
    tags.add('low_density');
  }
  if (regs.has('highlands_center')) {
    tags.add('highlands');
  }
  if (regs.has('keflavik') || regs.has('reykjavik')) {
    tags.add('reykjanes');
    tags.add('airport_corridor');
    tags.add('south_gate');
  }
  return tags;
}

function stationMatchesMode(st: IcelandEnergyStationRecord, mode: 'ice' | 'ev'): boolean {
  if (mode === 'ev') return st.kind === 'ev' || st.kind === 'hybrid';
  return st.kind === 'gas' || st.kind === 'hybrid';
}

function scoreStation(st: IcelandEnergyStationRecord, routeTags: Set<string>): number {
  let sc = 0;
  for (const t of st.corridor_tags || []) {
    if (routeTags.has(t)) sc += 2;
    for (const rt of routeTags) {
      if (t.includes(rt) || rt.includes(t)) sc += 1;
    }
  }
  if (routeTags.has('south_coast') && st.region_preset === 'vik') sc += 2;
  if (
    routeTags.has('westfjords') &&
    (st.region_preset === 'isafjordur' || st.region_preset === 'patreksfjordur' || st.region_preset === 'holmavik')
  ) {
    sc += 3;
  }
  return sc;
}

function touchesDesertKey(
  routeTags: Set<string>,
  deserts: IcelandEnergyStationsPack['supply_desert_tags'],
): string | null {
  if (routeTags.has('highlands') && deserts.highlands) return 'highlands';
  if (routeTags.has('westfjords') && deserts.westfjords) return 'westfjords';
  if (routeTags.has('eastfjords') && deserts.eastfjords_remote) return 'eastfjords_remote';
  return null;
}

function pickMustRefillBeforeDesert(
  pack: IcelandEnergyStationsPack,
  mode: 'ice' | 'ev',
  desertKey: string,
  routeTags: Set<string>,
): { station_id: string; warning: string } | undefined {
  const candidates = pack.stations.filter(
    (s) =>
      stationMatchesMode(s, mode) &&
      !s.corridor_tags.includes('westfjords') &&
      s.region_preset !== 'isafjordur' &&
      s.region_preset !== 'patreksfjordur' &&
      s.region_preset !== 'holmavik' &&
      !s.corridor_tags.includes('highlands'),
  );
  const ranked = [...candidates].sort((a, b) => scoreStation(b, routeTags) - scoreStation(a, routeTags));
  const pick = ranked[0];
  if (!pick) return undefined;
  const w =
    desertKey === 'highlands'
      ? 'Entering supply desert (highlands): refuel/charge before leaving paved services corridor.'
      : `Entering supply desert (${desertKey}): plan refuel/charge at last reliable services.`;
  return { station_id: pick.id, warning: w };
}

/**
 * v0：续航缺口 + 70% 标称续航无站焦虑 + 荒漠进入前强制锚点。
 */
export function runGasEvPlannerCore(input: {
  totalKm: number;
  energy_mode: 'ice' | 'ev';
  baseline: IcelandVehicleEnergyBaseline;
  vehicle_class: IcelandPlannerVehicleClass;
  segments: GasEvPlannerSegment[];
  pack: IcelandEnergyStationsPack;
}): IcelandGasEvPlannerCoreResult {
  const { totalKm, energy_mode, baseline, vehicle_class, segments, pack } = input;
  const routeTags = routeCorridorTagsForSegments(segments);

  let estimatedConsumption = 0;
  let usableCap = 0;
  if (energy_mode === 'ev') {
    const kwh100 = baseline.kwhPer100 ?? 25;
    estimatedConsumption = (totalKm / 100) * kwh100;
    usableCap = usableBatteryKwh(baseline);
  } else {
    const l100 = baseline.litersPer100 ?? 7.5;
    estimatedConsumption = (totalKm / 100) * l100;
    usableCap = usableTankLiters(baseline);
  }

  const nominalRange = baseline.nominalRangeKm;
  const anxietyKm = nominalRange * RANGE_ANXIETY_FRACTION;

  const regs = regionSet(segments);
  const matched = pack.stations
    .filter((s) => stationMatchesMode(s, energy_mode))
    .filter((s) => scoreStation(s, routeTags) > 0 || regs.has(s.region_preset));

  const tankBreak = usableCap > 0 && estimatedConsumption > usableCap;
  const longLegNoStations = totalKm > anxietyKm && matched.length === 0;
  const refuel_or_charge_required = tankBreak || longLegNoStations;

  const recommended = [...matched]
    .sort((a, b) => scoreStation(b, routeTags) - scoreStation(a, routeTags))
    .slice(0, 3)
    .map((s) => ({
      station_id: s.id,
      name: s.name,
      kind: s.kind,
      match_reason: `corridor_tags∩route=${[...routeTags].filter((t) => s.corridor_tags.includes(t)).join(',') || 'region:' + s.region_preset}`,
    }));

  const safety_alerts: string[] = [];
  if (longLegNoStations) {
    safety_alerts.push(
      `Warning: route ~${Math.round(totalKm)} km exceeds ${RANGE_ANXIETY_FRACTION * 100}% nominal range (~${Math.round(anxietyKm)} km) with no corridor-matched stations in seed index.`,
    );
  }
  if (tankBreak) {
    safety_alerts.push(
      `Range gap: estimated ${energy_mode === 'ev' ? 'consumption' : 'fuel'} ${estimatedConsumption.toFixed(1)} ${energy_mode === 'ev' ? 'kWh' : 'L'} exceeds usable ${usableCap.toFixed(1)} ${energy_mode === 'ev' ? 'kWh' : 'L'} (after reserve).`,
    );
  }

  const desertKey = touchesDesertKey(routeTags, pack.supply_desert_tags || {});
  let must_refill_before: IcelandGasEvPlannerCoreResult['must_refill_before'];
  if (desertKey) {
    must_refill_before = pickMustRefillBeforeDesert(pack, energy_mode, desertKey, routeTags);
    if (must_refill_before) {
      safety_alerts.push(`Supply desert: ${desertKey} — ${must_refill_before.warning}`);
    }
  }

  const feasible = !(refuel_or_charge_required && recommended.length === 0);

  const critical_segment =
    tankBreak || longLegNoStations
      ? segments.map((s) => `${s.from_region}→${s.to_region}`).join(' | ') || 'full_route'
      : undefined;

  return {
    feasible,
    refuel_or_charge_required,
    critical_segment,
    must_refill_before,
    recommended_stops: recommended,
    safety_alerts,
    metrics: {
      energy_mode,
      vehicle_class,
      total_km: Math.round(totalKm * 10) / 10,
      estimated_consumption_l_or_kwh: Math.round(estimatedConsumption * 10) / 10,
      usable_capacity_l_or_kwh: Math.round(usableCap * 10) / 10,
      nominal_range_km: nominalRange,
      range_anxiety_threshold_km: Math.round(anxietyKm * 10) / 10,
    },
  };
}
