import { Injectable } from '@nestjs/common';
import type { DraftDay } from '../dto/trip-draft.dto';
import type { GlobalWorldState, WorldBusEvent } from '../draft-synthesis/autonomous-world';
import type { ImpactAnalysisResult } from '../draft-synthesis/world-simulation/impact-analysis.types';
import type { WorldEvent } from '../draft-synthesis/world-simulation/world-event.types';
import type { WorldState } from '../draft-synthesis/world-simulation/world-state.types';
import type { CityDigitalTwin } from '../draft-synthesis/digital-twin/city-digital-twin.types';
import type { CityFlowScore } from '../draft-synthesis/digital-twin';
import { WorldOrchestratorService } from './world-orchestrator.service';
import { WorldBusService } from './world-bus.service';
import { WorldSimulationService } from './world-simulation.service';
import { CityDigitalTwinService } from './city-digital-twin.service';

/**
 * 统一世界内核（P1）：把全局总线、行程级 WorldState、城市孪生查询收敛到单一 facade，
 * 避免调用方直接散落三类 Service。
 */
@Injectable()
export class WorldKernelService {
  constructor(
    private readonly worldBus: WorldBusService,
    private readonly orchestrator: WorldOrchestratorService,
    private readonly worldSimulation: WorldSimulationService,
    private readonly cityTwin: CityDigitalTwinService,
  ) {}

  /** 全局总线写入（GlobalWorldState + 孪生双写，与 WorldBusService.emit 等价） */
  updateBus(event: WorldBusEvent): GlobalWorldState {
    return this.worldBus.emit(event);
  }

  queryGlobal(): GlobalWorldState {
    return this.orchestrator.getGlobalState();
  }

  queryTrip(tripId: string): WorldState {
    return this.worldSimulation.getWorldState(tripId);
  }

  queryTwin(cityId: string): CityDigitalTwin | undefined {
    return this.cityTwin.getTwin(cityId);
  }

  evaluateTwinFlow(cityId: string): CityFlowScore | undefined {
    return this.cityTwin.evaluateFlow(cityId);
  }

  /** 行程级世界折叠（与全局层并行；持久化/对齐策略后续再做） */
  simulateTrip(tripId: string, event: WorldEvent): WorldState {
    return this.worldSimulation.applyEvent(tripId, event);
  }

  /** 行程事件 + 草案影响分析 */
  simulateTripWithImpact(
    tripId: string,
    event: WorldEvent,
    draftDays: DraftDay[],
  ): { worldState: WorldState; impact: ImpactAnalysisResult } {
    return this.worldSimulation.ingestEventAndAnalyze(tripId, event, draftDays);
  }
}
