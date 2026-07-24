import { buildEmotionalContext } from '../../../narrator/emotion-narrator-orchestrator.util';
import type { EmotionalContext } from '../../../narrator/types/emotional-context.type';
import { projectEmotionalContextForClient } from '../../../narrator/emotional-context-client-projection.util';
import type { JourneyState } from '../interfaces/journey-assistant.interface';

const STATIONARY_DISTANCE_METERS = 80;

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function computeStationaryMinutes(state: JourneyState, now = Date.now()): number | undefined {
  const ps = state.presenceSignals;
  if (!ps?.lastLocationUpdatedAt) return undefined;
  const elapsedMs = now - new Date(ps.lastLocationUpdatedAt).getTime();
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return undefined;
  return Math.floor(elapsedMs / 60000);
}

export function resolveLocalTimeFromState(state: JourneyState): string | undefined {
  const tz = state.presenceSignals?.timezone;
  if (!tz) return undefined;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
  } catch {
    return undefined;
  }
}

/** 从 JourneyState 投影 P0 EmotionalContext（纯函数，无 IO）。 */
export function buildJourneyEmotionalContext(state: JourneyState): EmotionalContext {
  const stationaryMinutes = computeStationaryMinutes(state);
  const activeEvents = state.activeEvents ?? [];
  const hasCriticalEvent = activeEvents.some((e) => e.severity === 'critical');
  const hasWeatherAlert = activeEvents.some((e) => e.type === 'WEATHER_ALERT');

  return buildEmotionalContext({
    userId: state.userId,
    tripId: state.tripId,
    lastUserMessage: state.presenceSignals?.lastUserMessage,
    weatherWindLockActive: hasWeatherAlert,
    realtimeState: {
      localTime: resolveLocalTimeFromState(state),
      stationaryMinutes,
      continuousDrivingSeconds: state.presenceSignals?.continuousDrivingSeconds,
      delayMinutes: hasCriticalEvent ? 90 : undefined,
      speedMs: hasCriticalEvent ? 0 : undefined,
      decisionMetaMode: hasCriticalEvent ? 'EMERGENCY' : undefined,
      weatherWindLockActive: hasWeatherAlert,
    },
  });
}

export function syncJourneyPresenceSignals(
  state: JourneyState,
  input: {
    message?: string;
    currentLocation?: { lat: number; lng: number; name?: string };
    timezone?: string;
    continuousDrivingSeconds?: number;
  },
): JourneyState {
  const now = new Date().toISOString();
  const ps = { ...(state.presenceSignals ?? {}) };

  if (input.message?.trim()) {
    ps.lastUserMessage = input.message.trim();
    ps.lastUserMessageAt = now;
  }
  if (input.timezone?.trim()) {
    ps.timezone = input.timezone.trim();
  }
  if (
    typeof input.continuousDrivingSeconds === 'number' &&
    Number.isFinite(input.continuousDrivingSeconds)
  ) {
    ps.continuousDrivingSeconds = input.continuousDrivingSeconds;
  }

  const loc = input.currentLocation ?? state.currentLocation;
  if (loc) {
    const prev = ps.lastKnownLocation;
    const moved =
      !prev ||
      haversineMeters(prev, loc) >= STATIONARY_DISTANCE_METERS;
    if (moved) {
      ps.lastLocationUpdatedAt = now;
      ps.lastKnownLocation = { lat: loc.lat, lng: loc.lng };
    }
    state.currentLocation = loc;
  }

  state.presenceSignals = ps;
  state.emotionalContext = buildJourneyEmotionalContext(state);
  return state;
}

/** API 出站：将内部 EmotionalContext 投影为 client schema */
export function projectJourneyStateForClientResponse(state: JourneyState): JourneyState {
  const projected = projectEmotionalContextForClient(state.emotionalContext);
  if (!projected) return state;
  return {
    ...state,
    emotionalContext: projected as unknown as JourneyState['emotionalContext'],
  };
}

export function mapJourneyApiContext(context?: {
  currentLocation?: { lat: number; lng: number; name?: string };
  timezone?: string;
  continuousDrivingSeconds?: number;
}) {
  if (!context) return undefined;
  return {
    currentLocation: context.currentLocation,
    timezone: context.timezone,
    continuousDrivingSeconds: context.continuousDrivingSeconds,
  };
}
