import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { EmotionalContext, EmotionalRealtimeSignals } from './types/emotional-context.type';

type RouteAndRunEmotionalRequest = RouteAndRunRequestDto & {
  emotionalRealtimeSignals?: EmotionalRealtimeSignalsDtoLike;
  offlineMapsSynced?: boolean;
};

type EmotionalRealtimeSignalsDtoLike = {
  continuousDrivingSeconds?: number;
  continuous_driving_seconds?: number;
  speedMs?: number;
  speed_ms?: number;
  delayMinutes?: number;
  delay_minutes?: number;
  localTime?: string;
  local_time?: string;
  decisionMetaMode?: EmotionalRealtimeSignals['decisionMetaMode'];
  decision_meta_mode?: EmotionalRealtimeSignals['decisionMetaMode'];
  weatherWindLockActive?: boolean;
  weather_wind_lock_active?: boolean;
  stationaryMinutes?: number;
  stationary_minutes?: number;
};

function pickFiniteNumber(...values: unknown[]): number | undefined {
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return undefined;
}

function pickNonEmptyString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function pickBoolean(...values: unknown[]): boolean | undefined {
  for (const v of values) {
    if (typeof v === 'boolean') return v;
  }
  return undefined;
}

/** 归一化 route_and_run / BFF 透传的运行时传感器（snake + camel） */
export function normalizeEmotionalRealtimeSignals(
  raw?: EmotionalRealtimeSignalsDtoLike | null,
): EmotionalRealtimeSignals | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const continuousDrivingSeconds = pickFiniteNumber(
    raw.continuousDrivingSeconds,
    raw.continuous_driving_seconds,
  );
  const speedMs = pickFiniteNumber(raw.speedMs, raw.speed_ms);
  const delayMinutes = pickFiniteNumber(raw.delayMinutes, raw.delay_minutes);
  const localTime = pickNonEmptyString(raw.localTime, raw.local_time);
  const decisionMetaMode = pickNonEmptyString(
    raw.decisionMetaMode,
    raw.decision_meta_mode,
  ) as EmotionalRealtimeSignals['decisionMetaMode'] | undefined;
  const weatherWindLockActive = pickBoolean(
    raw.weatherWindLockActive,
    raw.weather_wind_lock_active,
  );
  const stationaryMinutes = pickFiniteNumber(raw.stationaryMinutes, raw.stationary_minutes);

  const out: EmotionalRealtimeSignals = {
    ...(continuousDrivingSeconds != null ? { continuousDrivingSeconds } : {}),
    ...(speedMs != null ? { speedMs } : {}),
    ...(delayMinutes != null ? { delayMinutes } : {}),
    ...(localTime ? { localTime } : {}),
    ...(decisionMetaMode ? { decisionMetaMode } : {}),
    ...(weatherWindLockActive != null ? { weatherWindLockActive } : {}),
    ...(stationaryMinutes != null ? { stationaryMinutes } : {}),
  };

  return Object.keys(out).length > 0 ? out : undefined;
}

/** INTAKE 前：将客户端传感器写入 OrchestratorState.metadata（只读供 EmotionNarrator 消费） */
export function mergeEmotionalClientSignalsFromRouteAndRunRequest(
  metadata: OrchestratorState['metadata'],
  request: RouteAndRunRequestDto,
): OrchestratorState['metadata'] {
  const req = request as RouteAndRunEmotionalRequest;
  const md = (metadata ?? {}) as Record<string, unknown>;
  const signals = normalizeEmotionalRealtimeSignals(
    req.emotional_realtime_signals ?? req.emotionalRealtimeSignals,
  );
  const offlineSynced = pickBoolean(req.offline_maps_synced, req.offlineMapsSynced);

  if (!signals && offlineSynced == null) return metadata;

  const merged: Record<string, unknown> = { ...md };

  if (signals) {
    const prior =
      md.emotional_realtime_signals &&
      typeof md.emotional_realtime_signals === 'object' &&
      !Array.isArray(md.emotional_realtime_signals)
        ? (md.emotional_realtime_signals as Record<string, unknown>)
        : {};
    merged.emotional_realtime_signals = { ...prior, ...signals };
  }

  if (offlineSynced != null) {
    merged.offline_maps_synced = offlineSynced;
  }

  return merged as OrchestratorState['metadata'];
}

/** NARRATE 后：双写 state.emotional_context + metadata（保留 started_at 供 assembler 回放） */
export function persistEmotionalContextToOrchestratorMetadata(
  state: OrchestratorState,
  emotionalContext: EmotionalContext,
): void {
  state.emotional_context = emotionalContext;
  const md = (state.metadata ?? {}) as Record<string, unknown>;
  const startedAt =
    typeof md.started_at === 'string' && md.started_at.trim()
      ? md.started_at
      : new Date().toISOString();

  state.metadata = {
    ...md,
    started_at: startedAt,
    last_updated_at: new Date().toISOString(),
    emotional_context: emotionalContext,
  } as OrchestratorState['metadata'];
}
