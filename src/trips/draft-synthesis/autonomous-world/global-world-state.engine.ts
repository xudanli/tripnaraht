import type { GlobalWorldState } from './global-world-state.types';
import type { WorldBusEvent } from './world-bus-event.types';

export function createInitialGlobalWorldState(time: number = Date.now()): GlobalWorldState {
  return {
    time,
    cities: {},
    poiNetwork: {},
    transportGraph: { edges: [], congestionMap: {} },
    activeTrips: [],
  };
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * 将总线事件折叠进全局世界状态（纯函数，可回放）。
 */
export function reduceGlobalWorldState(prev: GlobalWorldState, event: WorldBusEvent): GlobalWorldState {
  const next: GlobalWorldState = JSON.parse(JSON.stringify(prev)) as GlobalWorldState;
  next.time = Math.max(next.time, event.timestamp);

  const city = event.cityKey;
  if (city) {
    if (!next.cities[city]) {
      next.cities[city] = { congestion: 0.3, weather: 'unknown', disruptionLevel: 0 };
    }
  }

  switch (event.kind) {
    case 'WEATHER': {
      if (city) {
        const w = String(event.payload.condition ?? event.payload.weather ?? 'rain');
        next.cities[city].weather = w;
        if (/storm|rain|雪|雨/i.test(w)) {
          next.cities[city].disruptionLevel = clamp01(next.cities[city].disruptionLevel + 0.15);
        }
      }
      break;
    }
    case 'CROWD': {
      const pid = event.placeId ?? Number(event.payload.placeId);
      if (Number.isFinite(pid)) {
        if (!next.poiNetwork[pid]) next.poiNetwork[pid] = { capacity: 1, load: 0.4, risk: 0.3 };
        next.poiNetwork[pid].load = clamp01(
          next.poiNetwork[pid].load + Number(event.payload.delta ?? 0.2),
        );
      }
      if (city) {
        next.cities[city].congestion = clamp01(next.cities[city].congestion + 0.1);
      }
      break;
    }
    case 'TRANSPORT': {
      const edgeKey = String(event.payload.edgeKey ?? `${event.payload.from}|${event.payload.to}`);
      next.transportGraph.congestionMap[edgeKey] = clamp01(
        Number(event.payload.congestion ?? 0.65),
      );
      if (city) next.cities[city].disruptionLevel = clamp01(next.cities[city].disruptionLevel + 0.08);
      break;
    }
    case 'SYSTEM': {
      if (event.subType === 'GLOBAL_TICK' && typeof event.payload.time === 'number') {
        next.time = event.payload.time as number;
      }
      if (event.subType === 'TRIP_CREATED' && typeof event.payload.tripId === 'string') {
        const tid = event.payload.tripId as string;
        if (!next.activeTrips.includes(tid)) next.activeTrips.push(tid);
      }
      if (event.subType === 'GOVERNANCE_TICK' && city) {
        const p = Number(event.payload.maxPressure);
        if (Number.isFinite(p) && p >= 0) {
          next.cities[city].disruptionLevel = clamp01(next.cities[city].disruptionLevel + 0.12 * p);
          next.cities[city].congestion = clamp01(next.cities[city].congestion + 0.08 * p);
        }
      }
      break;
    }
    default:
      break;
  }

  return next;
}
