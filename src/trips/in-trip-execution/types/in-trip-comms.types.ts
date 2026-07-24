export type IntercomMessageType = 'text' | 'voice' | 'location_pin' | 'system';

export interface IntercomMessageAudio {
  url?: string;
  durationSec?: number;
  mimeType?: string;
  transcriptId?: string;
  /** 持久化用 — 读时签名，API 不暴露 */
  storageKey?: string;
  fileUrl?: string | null;
}

export interface IntercomMessageLocation {
  lat: number;
  lng: number;
  label?: string;
}

export interface IntercomMessageDto {
  id?: string;
  clientId: string;
  tripId: string;
  senderId: string;
  senderDisplayName?: string;
  clientSeq: number;
  type: IntercomMessageType;
  body: string;
  audio?: IntercomMessageAudio;
  location?: IntercomMessageLocation;
  createdAt: string;
  serverCreatedAt?: string;
  readBy?: string[];
  metadata?: Record<string, unknown>;
}

export interface IntercomPeerDto {
  userId: string;
  displayName?: string;
  distanceMeters: number | null;
  lastSeenAt: string;
  connection: 'online' | 'offline';
  lastLocation?: { lat: number; lng: number; accuracyMeters?: number };
}

export interface CommsSyncIncomingMessage {
  clientId: string;
  clientSeq: number;
  type: IntercomMessageType;
  body: string;
  audio?: IntercomMessageAudio;
  location?: IntercomMessageLocation;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface CommsSyncRequest {
  messages?: CommsSyncIncomingMessage[];
  lastKnownServerSeq?: number;
}

export interface CommsSyncWarning {
  clientId: string;
  code: 'SEQ_GAP' | 'INVALID_PAYLOAD';
  message?: string;
}

export interface CommsSyncResult {
  syncedIds: string[];
  serverMessages: IntercomMessageDto[];
  latestServerSeq: number;
  syncedAt: string;
  warnings?: CommsSyncWarning[];
}

export interface CommsListQuery {
  since?: string;
  limit?: number;
  before?: string;
}

export interface CommsListResult {
  messages: IntercomMessageDto[];
  latestServerSeq: number;
  hasMore: boolean;
  nextBefore: string | null;
}

export interface CommsPeersQuery {
  refLat?: number;
  refLng?: number;
  staleAfterSec?: number;
}

export interface CommsPeersResult {
  peers: IntercomPeerDto[];
  referencePoint: {
    lat: number;
    lng: number;
    source: 'self' | 'explicit' | 'unavailable';
  } | null;
  asOf: string;
}

export interface CommsHeartbeatRequest {
  lat?: number;
  lng?: number;
  accuracyMeters?: number;
  clientTimestamp?: string;
  shareLocation?: boolean;
}

export interface CommsHeartbeatResult {
  accepted: boolean;
  ttlSec: number;
}

export interface CommsMessagePayload {
  audio?: IntercomMessageAudio;
  location?: IntercomMessageLocation;
  metadata?: Record<string, unknown>;
}

export interface CommsSummaryResult {
  tripId: string;
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  bullets: string[];
  sourceMessageIds?: string[];
  degraded?: boolean;
  reason?: string;
}
