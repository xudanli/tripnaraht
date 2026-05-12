/**
 * iceland.gasAndEvChargePlanner — 补给/充电 v0 生存审计（种子 POI + 能源基准 + routeFeasibility 能耗）。
 */

import { Injectable } from '@nestjs/common';
import { Skill, SkillInput } from '../interfaces/skill.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import type {
  IcelandGasEvPlannerOutput,
  IcelandRouteEnergyDemandEstimate,
  IcelandRouteFeasibilityVehicle,
} from './iceland-world-driving-contracts';
import {
  getEnergyBaselineForPlanner,
  mapFeasibilityVehicleToPlannerClass,
} from './utils/iceland-energy-baseline.util';
import type { IcelandEnergyStationsPack } from './utils/iceland-gas-ev-planner-core.util';
import { runGasEvPlannerCore, type GasEvPlannerSegment } from './utils/iceland-gas-ev-planner-core.util';
import energyPackSeed from './data/iceland-energy-stations.json';

export interface IcelandGasEvPlannerInput extends SkillInput {
  request_id: string;
  energyDemandEstimate: IcelandRouteEnergyDemandEstimate;
  segments: GasEvPlannerSegment[];
  vehicle?: IcelandRouteFeasibilityVehicle;
  /** 缺省 ice；ev 时使用 BEV 通用基准 */
  energy_mode?: 'ice' | 'ev';
}

@SkillDecorator({
  name: 'iceland.gasAndEvChargePlanner',
  description:
    '冰岛补给/充电 v0：能源基准缺口、70% 标称续航无站焦虑、荒漠进入前锚点；消费 iceland-energy-stations.json 与 routeFeasibility.energyDemandEstimate。',
  version: '1.0.0',
  category: 'world',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class IcelandGasEvChargePlannerSkill implements Skill<IcelandGasEvPlannerInput, IcelandGasEvPlannerOutput> {
  metadata = {
    name: 'iceland.gasAndEvChargePlanner',
    description: 'Gas/EV 生存审计与走廊匹配推荐站（种子数据）。',
    version: '1.0.0',
    category: 'world' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: ['request_id', 'energyDemandEstimate', 'segments'],
      typeChecks: {
        request_id: { type: 'string' as const },
        segments: { type: 'array' as const, min: 1 },
      },
    },
  };

  private readonly pack: IcelandEnergyStationsPack;

  constructor() {
    this.pack = energyPackSeed as IcelandEnergyStationsPack;
  }

  async execute(input: IcelandGasEvPlannerInput): Promise<IcelandGasEvPlannerOutput> {
    const mode = input.energy_mode === 'ev' ? 'ev' : 'ice';
    const vehicle = input.vehicle ?? { type: '2wd' };
    const baseline = getEnergyBaselineForPlanner(vehicle, mode);
    const vehicleClass =
      mode === 'ev' ? 'ev_generic' : mapFeasibilityVehicleToPlannerClass(vehicle as IcelandRouteFeasibilityVehicle);
    const planningKm = input.energyDemandEstimate.energyPlanningKm ?? input.energyDemandEstimate.totalKm;

    if (!input.segments?.length) {
      throw new Error('iceland.gasAndEvChargePlanner requires segments');
    }

    const core = runGasEvPlannerCore({
      totalKm: planningKm,
      energy_mode: mode,
      baseline,
      vehicle_class: vehicleClass,
      segments: input.segments,
      pack: this.pack,
    });

    return {
      feasible: core.feasible,
      refuel_or_charge_required: core.refuel_or_charge_required,
      critical_segment: core.critical_segment,
      must_refill_before: core.must_refill_before,
      recommended_stops: core.recommended_stops,
      safety_alerts: core.safety_alerts,
      metrics: {
        energy_mode: core.metrics.energy_mode,
        vehicle_class: String(core.metrics.vehicle_class),
        total_km: core.metrics.total_km,
        estimated_consumption_l_or_kwh: core.metrics.estimated_consumption_l_or_kwh,
        usable_capacity_l_or_kwh: core.metrics.usable_capacity_l_or_kwh,
        nominal_range_km: core.metrics.nominal_range_km,
        range_anxiety_threshold_km: core.metrics.range_anxiety_threshold_km,
      },
    };
  }
}
