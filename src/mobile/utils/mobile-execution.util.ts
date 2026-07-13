import { DateTime } from 'luxon';
import { TripStatus, normalizeTripStatus } from '../../trips/dto/trip-status.dto';
import type {
  MobileExecutionItemStatus,
  MobileMemberRole,
  MobileTripLifecycle,
} from '../dto/mobile-execution.types';

export function computeMobileContextVersion(input: {
  constraintsVersion: number;
  tripUpdatedAt: string | Date;
  effectivePlanVersionId?: string;
}): number {
  const updatedMs =
    input.tripUpdatedAt instanceof Date
      ? input.tripUpdatedAt.getTime()
      : Date.parse(String(input.tripUpdatedAt)) || 0;
  const planPart = input.effectivePlanVersionId ?? '';
  const planHash = planPart.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 997;
  return input.constraintsVersion * 1_000_000 + (updatedMs % 100_000) + planHash;
}

export function mapTripLifecycle(status: string | null | undefined): MobileTripLifecycle {
  const normalized = normalizeTripStatus(status ?? null);
  switch (normalized) {
    case TripStatus.TRAVELING:
      return 'traveling';
    case TripStatus.COMPLETED:
      return 'completed';
    case TripStatus.CANCELLED:
      return 'cancelled';
    default:
      return 'planning';
  }
}

export function lifecycleLabel(lifecycle: MobileTripLifecycle): string {
  switch (lifecycle) {
    case 'traveling':
      return '旅行中';
    case 'completed':
      return '已完成';
    case 'cancelled':
      return '已取消';
    default:
      return '规划中';
  }
}

export function mapCollaboratorRole(role: string): MobileMemberRole {
  const upper = role.toUpperCase();
  if (upper === 'OWNER' || upper === 'EDITOR') return 'leader';
  return 'member';
}

export function resolveDayNumber(
  startDate: Date,
  endDate: Date,
  now: DateTime = DateTime.now(),
  dayIndex?: number,
): number {
  if (dayIndex != null && dayIndex >= 1) return dayIndex;
  const start = DateTime.fromJSDate(startDate).startOf('day');
  const end = DateTime.fromJSDate(endDate).startOf('day');
  const today = now.startOf('day');
  if (today < start) return 1;
  if (today > end) return Math.max(1, Math.floor(end.diff(start, 'days').days) + 1);
  return Math.floor(today.diff(start, 'days').days) + 1;
}

export function formatTimeHHmm(isoOrDate?: string | Date | null): string {
  if (!isoOrDate) return '--:--';
  const dt =
    isoOrDate instanceof Date
      ? DateTime.fromJSDate(isoOrDate)
      : DateTime.fromISO(isoOrDate);
  if (!dt.isValid) return '--:--';
  return dt.toFormat('HH:mm');
}

export function formatDurationMinutes(start?: Date | null, end?: Date | null): string | undefined {
  if (!start || !end) return undefined;
  const mins = Math.round(DateTime.fromJSDate(end).diff(DateTime.fromJSDate(start), 'minutes').minutes);
  if (mins <= 0) return undefined;
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatRemainingMinutes(targetIso?: string, now: DateTime = DateTime.now()): string {
  if (!targetIso) return '—';
  const target = DateTime.fromISO(targetIso);
  if (!target.isValid) return '—';
  const mins = Math.round(target.diff(now, 'minutes').minutes);
  if (mins <= 0) return '已到达';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `剩余 ${m}m`;
  return `剩余 ${h}h ${m}m`;
}

export function inferExecutionItemStatus(input: {
  startTime?: Date | null;
  endTime?: Date | null;
  now?: DateTime;
  isCurrent?: boolean;
  isDelayed?: boolean;
  hasRisk?: boolean;
  isCancelled?: boolean;
}): MobileExecutionItemStatus {
  const now = input.now ?? DateTime.now();
  if (input.isCancelled) return 'cancelled';
  if (input.hasRisk) return 'risk';
  if (input.isDelayed) return 'delayed';
  if (input.isCurrent) return 'inProgress';
  if (input.endTime && DateTime.fromJSDate(input.endTime) < now) return 'completed';
  if (input.startTime && DateTime.fromJSDate(input.startTime) <= now) return 'inProgress';
  return 'upcoming';
}

export function computeDayProgress(items: Array<{ status: MobileExecutionItemStatus }>): number {
  if (items.length === 0) return 0;
  const done = items.filter((i) => i.status === 'completed').length;
  const inProg = items.filter((i) => i.status === 'inProgress').length;
  return Math.min(1, (done + inProg * 0.5) / items.length);
}

export function severityToRiskLevel(severity?: string): 'high' | 'medium' | 'low' {
  const s = (severity ?? '').toLowerCase();
  if (s === 'critical' || s === 'high') return 'high';
  if (s === 'medium') return 'medium';
  return 'low';
}

export function attentionTypeIcon(type?: string): string {
  switch (type) {
    case 'weather_risk':
      return 'cloud.bolt.fill';
    case 'road_closed':
      return 'exclamationmark.triangle.fill';
    case 'schedule_conflict':
      return 'clock.badge.exclamationmark';
    case 'budget_alert':
      return 'yensign.circle';
    case 'safety_risk':
      return 'shield.lefthalf.filled';
    case 'sos':
      return 'sos';
    default:
      return 'bell.fill';
  }
}
