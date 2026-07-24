/** iOS SOS 契约 — POST /api/mobile/trips/{tripId}/emergency/sos */

export const EMERGENCY_SOS_TYPES = [
  'medical',
  'lost',
  'accident',
  'vehicle',
  'weather',
  'other',
] as const;

export type EmergencySosType = (typeof EMERGENCY_SOS_TYPES)[number];

export const EMERGENCY_SOS_TYPE_LABELS: Record<EmergencySosType, string> = {
  medical: '医疗求助',
  lost: '迷路/失联',
  accident: '意外受伤',
  vehicle: '车辆故障',
  weather: '极端天气',
  other: '其他',
};

export const MOBILE_NOTIFICATION_TYPES = [
  'announcement',
  'meeting',
  'safety',
  'risk_alert',
  'location_update',
  'arrived',
  'wait_here',
  'need_rest',
  'separated',
  'intercom_text',
  'intercom_status',
] as const;

export type MobileNotificationType = (typeof MOBILE_NOTIFICATION_TYPES)[number];

export function resolveEmergencySosType(raw?: string | null): EmergencySosType {
  if (raw == null || raw === '') return 'other';
  const normalized = raw.trim().toLowerCase();
  if ((EMERGENCY_SOS_TYPES as readonly string[]).includes(normalized)) {
    return normalized as EmergencySosType;
  }
  throw new Error(`invalid sos type: ${raw}`);
}

export function isEmergencySosType(raw: string): raw is EmergencySosType {
  return (EMERGENCY_SOS_TYPES as readonly string[]).includes(raw);
}

export function isMobileNotificationType(raw: string): raw is MobileNotificationType {
  return (MOBILE_NOTIFICATION_TYPES as readonly string[]).includes(raw);
}

/** 存储/对外 status：open | acknowledged | resolved */
export type EmergencySosPublicStatus = 'open' | 'acknowledged' | 'resolved';

export function mapLegacySosStatus(status?: string): EmergencySosPublicStatus {
  const upper = (status ?? '').toUpperCase();
  if (upper === 'ACKNOWLEDGED' || upper === 'IN_PROGRESS') return 'acknowledged';
  if (upper === 'RESOLVED') return 'resolved';
  return 'open';
}

export interface EmergencySosLocationDto {
  lat: number;
  lng: number;
}
