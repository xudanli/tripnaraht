import { isInTripExecutionEnabled } from './in-trip-config.util';

export function isInTripCommsEnabled(): boolean {
  const v = process.env.IN_TRIP_COMMS_ENABLED?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  if (v === '1' || v === 'true' || v === 'yes') return true;
  return isInTripExecutionEnabled();
}

export const COMMS_MAX_SYNC_BATCH = 50;
export const COMMS_MAX_BODY_LENGTH = 4096;
export const COMMS_DEFAULT_PEER_TTL_SEC = 120;
export const COMMS_DEFAULT_LIST_LIMIT = 50;
export const COMMS_MAX_LIST_LIMIT = 200;
export const COMMS_AUDIO_SIGNED_URL_TTL_SEC = Math.min(
  Math.max(60, Number(process.env.COMMS_AUDIO_SIGNED_URL_TTL_SEC ?? 900) || 900),
  3600,
);
