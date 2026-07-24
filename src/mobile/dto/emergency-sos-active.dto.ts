import type { EmergencySosType } from './emergency-sos.dto';

export type EmergencySosPublicStatus = 'open' | 'acknowledged' | 'resolved';

export type EmergencySosResolveReason = 'false_alarm' | 'resolved' | 'cancelled';

export const EMERGENCY_SOS_RESOLVE_REASONS = [
  'false_alarm',
  'resolved',
  'cancelled',
] as const;

export interface ActiveSosSnapshotDto {
  sosId: string;
  type: EmergencySosType;
  message?: string;
  location: { lat: number; lng: number } | null;
  createdAt: string;
  status: EmergencySosPublicStatus;
  userId?: string;
  acknowledgedBy?: { memberId: string; name: string };
}

export interface ActiveSosReadDto {
  active: boolean;
  sos?: ActiveSosSnapshotDto;
}

export interface EmergencyLocationShareDto {
  active: boolean;
  userId: string;
  sosId?: string | null;
  mode: 'emergency';
  intervalSeconds: number;
  startedAt: string;
}

/** iOS 持续位置共享约定：presence 10s + shareLocation=true + mode=emergency */
export const EMERGENCY_LOCATION_SHARE_INTERVAL_SECONDS = 10;
