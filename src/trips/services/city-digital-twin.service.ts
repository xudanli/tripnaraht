import { Injectable } from '@nestjs/common';
import type { CityDigitalTwin } from '../draft-synthesis/digital-twin/city-digital-twin.types';
import {
  createEmptyCityDigitalTwin,
  reduceCityTwinFromWorldBus,
  scoreCityFlowState,
} from '../draft-synthesis/digital-twin';
import type { WorldBusEvent } from '../draft-synthesis/autonomous-world/world-bus-event.types';
import type { CityFlowScore } from '../draft-synthesis/digital-twin';

/**
 * 城市孪生存储与演化（内存骨架）；可与 WorldOrchestrator、Governance 双写。
 */
@Injectable()
export class CityDigitalTwinService {
  private twins = new Map<string, CityDigitalTwin>();

  getTwin(cityId: string): CityDigitalTwin | undefined {
    const t = this.twins.get(cityId);
    return t ? (JSON.parse(JSON.stringify(t)) as CityDigitalTwin) : undefined;
  }

  ensureTwin(cityId: string): CityDigitalTwin {
    let t = this.twins.get(cityId);
    if (!t) {
      t = createEmptyCityDigitalTwin(cityId);
      this.twins.set(cityId, t);
    }
    return JSON.parse(JSON.stringify(t)) as CityDigitalTwin;
  }

  replaceTwin(next: CityDigitalTwin): void {
    this.twins.set(next.cityId, JSON.parse(JSON.stringify(next)) as CityDigitalTwin);
  }

  ingestWorldBus(cityId: string, event: WorldBusEvent): CityDigitalTwin {
    const prev = this.ensureTwin(cityId);
    const merged = reduceCityTwinFromWorldBus(prev, event);
    this.twins.set(cityId, merged);
    return JSON.parse(JSON.stringify(merged)) as CityDigitalTwin;
  }

  evaluateFlow(cityId: string): CityFlowScore | undefined {
    const t = this.twins.get(cityId);
    if (!t) return undefined;
    return scoreCityFlowState(t);
  }
}
