import type { WorldEvent } from './world-event.types';
import type { WorldState } from './world-state.types';

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function createInitialWorldState(timeEpochMs: number = Date.now()): WorldState {
  return {
    time: timeEpochMs,
    weather: {},
    poiStatus: {},
    transportStatus: {},
    crowdLevel: {},
    userState: {
      fatigue: 0.35,
      mood: 0.7,
      flexibility: 0.5,
    },
  };
}

/**
 * 事件折叠进世界状态（纯函数，可回放）。
 */
export function reduceWorldState(prev: WorldState, event: WorldEvent): WorldState {
  const next: WorldState = JSON.parse(JSON.stringify(prev)) as WorldState;
  next.time = Math.max(next.time, event.timestamp);

  switch (event.type) {
    case 'WEATHER_CHANGE': {
      const regionKey = String(event.payload.regionKey ?? event.payload.date ?? 'global');
      const condition = event.payload.condition as WorldState['weather'][string] | undefined;
      if (condition === 'sunny' || condition === 'rain' || condition === 'storm') {
        next.weather[regionKey] = condition;
      }
      break;
    }
    case 'POI_CLOSED':
    case 'CROWD_SPIKE': {
      const placeId = Number(event.payload.placeId);
      if (Number.isFinite(placeId)) {
        next.poiStatus[placeId] = event.type === 'POI_CLOSED' ? 'closed' : 'crowded';
        if (event.type === 'CROWD_SPIKE' && typeof event.payload.level === 'number') {
          next.crowdLevel[placeId] = clamp01(event.payload.level as number);
        }
      }
      break;
    }
    case 'TRANSPORT_DELAY': {
      const lineId = String(event.payload.lineId ?? 'default');
      next.transportStatus[lineId] = 'delayed';
      break;
    }
    case 'USER_INTERRUPT': {
      if (typeof event.payload.fatigueDelta === 'number') {
        next.userState.fatigue = clamp01(next.userState.fatigue + event.payload.fatigueDelta);
      }
      if (typeof event.payload.moodDelta === 'number') {
        next.userState.mood = clamp01(next.userState.mood + event.payload.moodDelta);
      }
      if (typeof event.payload.flexibility === 'number') {
        next.userState.flexibility = clamp01(event.payload.flexibility as number);
      }
      break;
    }
    default:
      break;
  }

  return next;
}
