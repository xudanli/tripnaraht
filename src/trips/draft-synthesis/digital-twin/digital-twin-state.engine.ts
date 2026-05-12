import type { CityDigitalTwin } from './city-digital-twin.types';
import type { WorldBusEvent } from '../autonomous-world/world-bus-event.types';

/**
 * 空孪生初始化。
 */
export function createEmptyCityDigitalTwin(cityId: string, time: number = Date.now()): CityDigitalTwin {
  return {
    cityId,
    time,
    mobilityLayer: { roads: { nodeIds: [], edges: [] }, congestion: {} },
    poiLayer: { nodes: [], capacity: {}, liveQueue: {} },
    demandLayer: { userFlows: 0, tripDensity: {} },
    disruptionLayer: { weather: {}, events: [] },
  };
}

/**
 * 将世界总线事件粗映射进城市孪生（与 GlobalWorldState 并行演化时可双写）。
 */
export function reduceCityTwinFromWorldBus(prev: CityDigitalTwin, event: WorldBusEvent): CityDigitalTwin {
  const next: CityDigitalTwin = JSON.parse(JSON.stringify(prev)) as CityDigitalTwin;
  next.time = Math.max(next.time, event.timestamp);

  if (event.kind === 'WEATHER' && event.cityKey) {
    next.disruptionLayer.weather[event.cityKey] = event.payload;
  }
  if (event.kind === 'CROWD' && event.placeId != null) {
    const pid = event.placeId;
    next.poiLayer.liveQueue[pid] = Math.min(
      1,
      (next.poiLayer.liveQueue[pid] ?? 0.3) + Number(event.payload.delta ?? 0.1),
    );
  }
  if (event.kind === 'TRANSPORT' && event.payload.edgeKey) {
    const ek = String(event.payload.edgeKey);
    next.mobilityLayer.congestion[ek] = Number(event.payload.congestion ?? 0.6);
  }

  return next;
}
