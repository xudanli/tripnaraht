import type { IntercomMessageDto } from '../../trips/in-trip-execution/types/in-trip-comms.types';

export type MobileIntercomMessageKind = 'voice' | 'text' | 'status' | 'system';

export type MobileIntercomStatusType = 'arrived' | 'wait_here' | 'need_rest' | 'separated';

export const INTERCOM_STATUS_TYPES = [
  'arrived',
  'wait_here',
  'need_rest',
  'separated',
] as const;

export function isIntercomStatusType(raw: string): raw is MobileIntercomStatusType {
  return (INTERCOM_STATUS_TYPES as readonly string[]).includes(raw);
}

export interface MobileIntercomMessageDto {
  id: string;
  clientId?: string;
  tripId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string | null;
  kind: MobileIntercomMessageKind;
  audioUrl?: string;
  durationSeconds?: number;
  transcript?: string;
  body?: string;
  statusType?: MobileIntercomStatusType;
  sentAt: string;
  distanceLabel?: string;
  deliveryStatus: 'sent' | 'delivered' | 'local_pending' | 'failed';
  transport: 'cloud' | 'bluetooth' | 'bluetooth_relay';
  isOwn: boolean;
}

export interface MobileIntercomMessagesResultDto {
  messages: MobileIntercomMessageDto[];
  hasMore: boolean;
  nextCursor?: string;
}

export interface MobileIntercomSummaryDto {
  status: 'ready' | 'stale' | 'offline';
  updatedAt: string;
  bullets: string[];
  detailUrl?: string;
}

export function formatDistanceMeters(meters: number | null | undefined): string | undefined {
  if (meters == null || meters <= 0) return undefined;
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

/** team-status 专用 — 无 GPS 时显式返回 null，便于 iOS 显示「—」 */
export function formatTeamDistanceLabel(meters: number | null | undefined): string | null {
  if (meters == null) return null;
  if (meters <= 0) return null;
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

export function formatTeamDistanceMeters(meters: number | null | undefined): number | null {
  if (meters == null) return null;
  return Math.max(0, Math.round(meters));
}

export function projectIntercomMessage(
  msg: IntercomMessageDto,
  currentUserId: string,
  avatarByUserId?: Map<string, string | null | undefined>,
): MobileIntercomMessageDto {
  const metadata = (msg.metadata ?? {}) as Record<string, unknown>;
  const intercomKind = metadata.intercomKind as string | undefined;
  const statusType = metadata.statusType as MobileIntercomStatusType | undefined;
  const transport = (metadata.transport as MobileIntercomMessageDto['transport']) ?? 'cloud';
  const deliveryStatus =
    (metadata.deliveryStatus as MobileIntercomMessageDto['deliveryStatus']) ?? 'sent';

  let kind: MobileIntercomMessageKind;
  if (intercomKind === 'status' || (msg.type === 'system' && statusType)) {
    kind = 'status';
  } else if (msg.type === 'voice') {
    kind = 'voice';
  } else if (msg.type === 'text') {
    kind = 'text';
  } else {
    kind = 'system';
  }

  return {
    id: msg.id ?? msg.clientId,
    clientId: msg.clientId,
    tripId: msg.tripId,
    senderId: msg.senderId,
    senderName: msg.senderDisplayName ?? msg.senderId.slice(0, 8),
    senderAvatarUrl: avatarByUserId?.get(msg.senderId) ?? null,
    kind,
    audioUrl: msg.audio?.url,
    durationSeconds: msg.audio?.durationSec,
    transcript: msg.type === 'voice' ? msg.body : undefined,
    body: kind === 'text' || kind === 'status' || kind === 'system' ? msg.body : undefined,
    statusType: kind === 'status' ? statusType : undefined,
    sentAt: msg.serverCreatedAt ?? msg.createdAt,
    distanceLabel: metadata.distanceLabel as string | undefined,
    deliveryStatus,
    transport,
    isOwn: msg.senderId === currentUserId,
  };
}
