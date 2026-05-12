import type {
  IcelandRouteEnergyDemandEstimate,
  IcelandRouteFeasibilitySegment,
  IcelandRouteFeasibilityVehicle,
} from '../iceland-world-driving-contracts';
import { getEnergyBaselineForPlanner, mapFeasibilityVehicleToPlannerClass } from './iceland-energy-baseline.util';

/** 纯碎石段：能耗/续航粗算等价于更长的铺装里程（保守，可调） */
const GRAVEL_ENERGY_EQUIV_MULT = 1.22;
/** 混合 / 断续碎石 */
const MIXED_SURFACE_EQUIV_MULT = 1.12;

/**
 * 由带 `surface` 与 `distanceKm` 的路段推导「能耗规划里程」；未标注 surface 的里程按 1.0 计。
 * 未覆盖 `geographicTotalKm` 的尾部按铺装 1.0 计入（与 routeFeasibility 总里程一致）。
 */
export function energyPlanningKmFromSegments(
  segments: IcelandRouteFeasibilitySegment[],
  geographicTotalKm: number,
): number {
  let weighted = 0;
  let covered = 0;
  for (const s of segments) {
    const d =
      typeof s.distanceKm === 'number' && Number.isFinite(s.distanceKm) && s.distanceKm >= 0 ? s.distanceKm : 0;
    if (d <= 0) continue;
    covered += d;
    const mult =
      s.surface === 'gravel' ? GRAVEL_ENERGY_EQUIV_MULT : s.surface === 'mixed' ? MIXED_SURFACE_EQUIV_MULT : 1;
    weighted += d * mult;
  }
  if (covered <= 0) return geographicTotalKm;
  const uncovered = Math.max(0, geographicTotalKm - covered);
  return Math.round((weighted + uncovered) * 10) / 10;
}

/** 与 {@link ICELAND_ENERGY_BASELINES} 对齐的粗算；供 routeFeasibility 与 gas/EV planner 共用。 */
export function estimateRouteEnergyDemand(
  totalKm: number,
  vehicle: IcelandRouteFeasibilityVehicle,
  segments?: IcelandRouteFeasibilitySegment[],
): IcelandRouteEnergyDemandEstimate {
  const geographic = Math.round(totalKm * 10) / 10;
  const planningKm = segments?.length ? energyPlanningKmFromSegments(segments, geographic) : geographic;
  const activeKm = Math.max(planningKm, geographic);

  const bl = getEnergyBaselineForPlanner(vehicle, 'ice');
  const lPer100 = bl.litersPer100 ?? 7.5;
  const evBl = getEnergyBaselineForPlanner(vehicle, 'ev');
  const kwhPer100 = evBl.kwhPer100 ?? 25;
  const liters = Math.round((activeKm / 100) * lPer100 * 10) / 10;
  const kwh = Math.round((activeKm / 100) * kwhPer100 * 10) / 10;
  const cls = mapFeasibilityVehicleToPlannerClass(vehicle);
  const baseId = `iceland_baseline:${cls}:l_per_100:${lPer100}:ev_kwh_per_100:${kwhPer100}`;
  const fuelBurnModelId =
    planningKm > geographic + 0.05
      ? `${baseId};geo_km:${geographic};energy_plan_km:${Math.round(activeKm * 10) / 10}`
      : `${baseId};geo_km:${geographic}`;

  return {
    totalKm: geographic,
    ...(planningKm > geographic + 0.05 ? { energyPlanningKm: Math.round(planningKm * 10) / 10 } : {}),
    estimatedFuelLitersGasolineEquiv: liters,
    estimatedEvKwh: kwh,
    fuelBurnModelId,
  };
}
