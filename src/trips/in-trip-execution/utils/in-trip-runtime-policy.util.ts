import type { InTripRuntimePolicy } from '../types/in-trip-offline.types';

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw == null || raw.trim() === '') return fallback;
  return raw === 'true' || raw === '1';
}

/** 客户端省电 / 流量策略（可由 env 覆盖，冰岛内测默认偏保守） */
export function resolveInTripRuntimePolicy(): InTripRuntimePolicy {
  const lowPower = envBool('IN_TRIP_LOW_POWER_MODE', false);

  return {
    syncIntervalMinutes: envInt('IN_TRIP_SYNC_INTERVAL_MINUTES', lowPower ? 15 : 5),
    environmentScanMinutes: envInt('IN_TRIP_ENV_SCAN_MINUTES', lowPower ? 60 : 30),
    experienceWeightCronHourUtc: envInt('IN_TRIP_WEIGHT_CRON_HOUR_UTC', 22),
    lowPowerMode: {
      disableMotionPolling: lowPower || envBool('IN_TRIP_DISABLE_MOTION_POLLING', false),
      reduceEnvironmentScan: lowPower || envBool('IN_TRIP_REDUCE_ENV_SCAN', false),
      batchOfflineSync: lowPower || envBool('IN_TRIP_BATCH_OFFLINE_SYNC', true),
    },
    networkPolicy: {
      wifiOnlyPackDownload: envBool('IN_TRIP_WIFI_ONLY_PACK', true),
      maxPackSizeMb: envInt('IN_TRIP_MAX_PACK_MB', 8),
      compressResponses: envBool('IN_TRIP_COMPRESS_RESPONSES', true),
    },
  };
}
