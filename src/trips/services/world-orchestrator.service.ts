import { Injectable, Optional } from '@nestjs/common';
import {
  createInitialGlobalWorldState,
  detectInterTripConflicts,
  proposeRebalanceActions,
  reduceGlobalWorldState,
  type GlobalWorldState,
  type GlobalConflict,
  type TripOccupancyRef,
  type WorldBusEvent,
} from '../draft-synthesis/autonomous-world';
import { CityDigitalTwinService } from './city-digital-twin.service';

/** 无城市键的事件进入全局桶，仍更新拥堵/POI 等可共享字段 */
const DEFAULT_TWIN_CITY_ID = 'GLOBAL';

function resolveTwinCityId(event: WorldBusEvent): string {
  const k = event.cityKey?.trim();
  return k && k.length > 0 ? k : DEFAULT_TWIN_CITY_ID;
}

/**
 * 自治世界调度内核（内存骨架）：维护 GlobalWorldState、活动行程集合、总线事件与跨行程冲突扫描。
 * 生产可换 Redis / 持久化流 + 真正的全局求解器。
 */
@Injectable()
export class WorldOrchestratorService {
  private globalState: GlobalWorldState = createInitialGlobalWorldState();
  /** tripId → 占用明细（粗粒度，用于冲突检测） */
  private occupancyByTrip = new Map<string, TripOccupancyRef[]>();

  constructor(@Optional() private readonly cityDigitalTwin?: CityDigitalTwinService) {}

  getGlobalState(): GlobalWorldState {
    return JSON.parse(JSON.stringify(this.globalState)) as GlobalWorldState;
  }

  registerActiveTrip(tripId: string): void {
    if (!this.globalState.activeTrips.includes(tripId)) {
      this.globalState.activeTrips.push(tripId);
    }
  }

  unregisterTrip(tripId: string): void {
    this.globalState.activeTrips = this.globalState.activeTrips.filter((id) => id !== tripId);
    this.occupancyByTrip.delete(tripId);
  }

  /** 上报或同步某行程的槽位占用（用于全局冲突检测） */
  setTripOccupancy(tripId: string, refs: TripOccupancyRef[]): void {
    this.registerActiveTrip(tripId);
    this.occupancyByTrip.set(tripId, refs);
  }

  /** 接收世界总线事件并折叠进全局状态 + 城市数字孪生（双写） */
  ingestWorldBusEvent(event: WorldBusEvent): GlobalWorldState {
    this.globalState = reduceGlobalWorldState(this.globalState, event);
    this.cityDigitalTwin?.ingestWorldBus(resolveTwinCityId(event), event);
    return this.getGlobalState();
  }

  /** 当前所有登记行程的全局冲突 */
  scanConflicts(): GlobalConflict[] {
    const all: TripOccupancyRef[] = [];
    for (const refs of this.occupancyByTrip.values()) {
      all.push(...refs);
    }
    return detectInterTripConflicts(all);
  }

  rebalanceHints(): ReturnType<typeof proposeRebalanceActions> {
    return proposeRebalanceActions(this.scanConflicts());
  }
}
