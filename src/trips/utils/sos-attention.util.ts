import {
  AttentionItemDto,
  AttentionItemType,
  AttentionSeverity,
  AttentionStatus,
} from '../dto/attention-queue.dto';
import { EMERGENCY_SOS_TYPE_LABELS, mapLegacySosStatus } from '../../mobile/dto/emergency-sos.dto';
import type { EmergencySosType } from '../../mobile/dto/emergency-sos.dto';
import {
  extractActiveSosRecord,
  extractActiveSosUserId,
} from './sos-active.util';

export { extractActiveSosUserId };

export function projectActiveSosAttentionItems(
  tripId: string,
  metadata: unknown,
): AttentionItemDto[] {
  const record = extractActiveSosRecord(metadata);
  if (!record) return [];

  const sosType = (record.type ?? 'other') as EmergencySosType;
  const label = EMERGENCY_SOS_TYPE_LABELS[sosType] ?? EMERGENCY_SOS_TYPE_LABELS.other;
  const publicStatus = mapLegacySosStatus(record.status);
  const attentionStatus =
    publicStatus === 'resolved'
      ? AttentionStatus.RESOLVED
      : publicStatus === 'acknowledged'
        ? AttentionStatus.ACKNOWLEDGED
        : AttentionStatus.NEW;

  return [
    {
      id: `sos-${record.sosId}`,
      type: AttentionItemType.SOS,
      title: `SOS · ${label}`,
      description: record.message ?? '成员发起紧急求助',
      tripId,
      severity: AttentionSeverity.CRITICAL,
      createdAt: record.sentAt ?? new Date().toISOString(),
      status: attentionStatus,
      metadata: {
        sosId: record.sosId,
        sosType,
        userId: record.userId,
        coordinates: record.coordinates ?? undefined,
      },
    },
  ];
}
