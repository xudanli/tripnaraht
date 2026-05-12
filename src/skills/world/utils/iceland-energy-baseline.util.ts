import type { IcelandRouteFeasibilityVehicle } from '../iceland-world-driving-contracts';

/**
 * 冰岛 v0 能源基准（保守冬季/横风/坡度经验系数），用于 gas/EV planner 与 route energy 估算对齐。
 * 非实测油耗；可观测、可替换为车队标定。
 */
export type IcelandPlannerVehicleClass = '2wd' | '4x4' | 'campervan' | 'ev_generic';

export interface IcelandVehicleEnergyBaseline {
  /** ICE 油箱升数；EV 时为 undefined */
  fuelCapacityL?: number;
  /** BEV 电池 kWh；ICE 时为 undefined */
  batteryKwh?: number;
  /** 标称续航（营销/工况混合档，仅作焦虑阈值比例尺） */
  nominalRangeKm: number;
  /** 安全余量：不可用油箱/电量比例 */
  safetyReserveFraction: number;
  litersPer100?: number;
  kwhPer100?: number;
  fuelTypeLabel: string;
}

export const ICELAND_ENERGY_BASELINES: Record<IcelandPlannerVehicleClass, IcelandVehicleEnergyBaseline> = {
  '2wd': {
    fuelCapacityL: 45,
    nominalRangeKm: 600,
    safetyReserveFraction: 0.15,
    litersPer100: 7.5,
    fuelTypeLabel: 'gasoline_compact',
  },
  '4x4': {
    fuelCapacityL: 60,
    nominalRangeKm: 700,
    safetyReserveFraction: 0.2,
    litersPer100: 8.5,
    fuelTypeLabel: 'diesel_suv',
  },
  campervan: {
    fuelCapacityL: 70,
    nominalRangeKm: 650,
    safetyReserveFraction: 0.25,
    litersPer100: 11,
    fuelTypeLabel: 'diesel_camper',
  },
  ev_generic: {
    batteryKwh: 75,
    nominalRangeKm: 400,
    safetyReserveFraction: 0.3,
    kwhPer100: 25,
    fuelTypeLabel: 'ev_generic',
  },
};

export function mapFeasibilityVehicleToPlannerClass(v: IcelandRouteFeasibilityVehicle): IcelandPlannerVehicleClass {
  if (v.type === '4x4') return '4x4';
  if (v.type === 'campervan') return 'campervan';
  return '2wd';
}

export function getEnergyBaselineForPlanner(
  vehicle: IcelandRouteFeasibilityVehicle | undefined,
  energyMode: 'ice' | 'ev',
): IcelandVehicleEnergyBaseline {
  if (energyMode === 'ev') {
    return ICELAND_ENERGY_BASELINES.ev_generic;
  }
  const cls = vehicle ? mapFeasibilityVehicleToPlannerClass(vehicle) : '2wd';
  return ICELAND_ENERGY_BASELINES[cls];
}

export function usableTankLiters(b: IcelandVehicleEnergyBaseline): number {
  if (!b.fuelCapacityL) return 0;
  return b.fuelCapacityL * (1 - b.safetyReserveFraction);
}

export function usableBatteryKwh(b: IcelandVehicleEnergyBaseline): number {
  if (!b.batteryKwh) return 0;
  return b.batteryKwh * (1 - b.safetyReserveFraction);
}
