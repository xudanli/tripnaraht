import type { EmergencySosType } from '../../mobile/dto/emergency-sos.dto';
import { mapLegacySosStatus } from '../../mobile/dto/emergency-sos.dto';
import type {
  ActiveSosReadDto,
  ActiveSosSnapshotDto,
} from '../../mobile/dto/emergency-sos-active.dto';

export interface StoredEmergencySosRecord {
  sosId: string;
  type?: EmergencySosType | string;
  userId?: string;
  message?: string;
  sentAt?: string;
  status?: string;
  coordinates?: { latitude: number; longitude: number } | null;
  acknowledgedBy?: { memberId: string; name: string; at?: string };
  resolvedBy?: { memberId: string; name: string; at?: string };
  resolveReason?: string;
  resolveComment?: string;
}

export function extractActiveSosRecord(metadata: unknown): StoredEmergencySosRecord | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const last = (metadata as Record<string, unknown>).lastEmergencySOS as
    | StoredEmergencySosRecord
    | undefined;
  if (!last?.sosId) return null;
  if (mapLegacySosStatus(last.status) === 'resolved') return null;
  return last;
}

export function extractActiveSosUserId(metadata: unknown): string | null {
  return extractActiveSosRecord(metadata)?.userId ?? null;
}

export function projectActiveSosRead(metadata: unknown): ActiveSosReadDto {
  const record = extractActiveSosRecord(metadata);
  if (!record) return { active: false };
  return {
    active: true,
    sos: projectActiveSosSnapshot(record),
  };
}

export function projectActiveSosSnapshot(record: StoredEmergencySosRecord): ActiveSosSnapshotDto {
  const coords = record.coordinates;
  const hasCoords =
    coords != null && Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude);
  const publicStatus = mapLegacySosStatus(record.status);

  return {
    sosId: record.sosId,
    type: (record.type ?? 'other') as EmergencySosType,
    message: record.message,
    location: hasCoords ? { lat: coords!.latitude, lng: coords!.longitude } : null,
    createdAt: record.sentAt ?? new Date().toISOString(),
    status: publicStatus,
    userId: record.userId,
    acknowledgedBy: record.acknowledgedBy
      ? { memberId: record.acknowledgedBy.memberId, name: record.acknowledgedBy.name }
      : undefined,
  };
}
