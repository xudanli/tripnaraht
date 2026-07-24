import type { TripInTripCommsMessage } from '@prisma/client';
import type {
  CommsMessagePayload,
  IntercomMessageDto,
  IntercomMessageType,
} from '../types/in-trip-comms.types';

export function parseCommsPayload(raw: unknown): CommsMessagePayload {
  if (!raw || typeof raw !== 'object') return {};
  return raw as CommsMessagePayload;
}

export function toIntercomMessageDto(
  row: TripInTripCommsMessage,
  senderDisplayName?: string,
): IntercomMessageDto {
  const payload = parseCommsPayload(row.payload);
  return {
    id: row.id,
    clientId: row.clientId,
    tripId: row.tripId,
    senderId: row.senderId,
    senderDisplayName,
    clientSeq: Number(row.clientSeq),
    type: row.messageType as IntercomMessageType,
    body: row.body,
    audio: payload.audio,
    location: payload.location,
    createdAt: row.clientCreatedAt.toISOString(),
    serverCreatedAt: row.serverCreatedAt.toISOString(),
    metadata: payload.metadata,
  };
}

export function buildCommsPayload(input: {
  audio?: CommsMessagePayload['audio'];
  location?: CommsMessagePayload['location'];
  metadata?: Record<string, unknown>;
}): CommsMessagePayload | undefined {
  const payload: CommsMessagePayload = {};
  if (input.audio) payload.audio = input.audio;
  if (input.location) payload.location = input.location;
  if (input.metadata && Object.keys(input.metadata).length > 0) {
    payload.metadata = input.metadata;
  }
  return Object.keys(payload).length > 0 ? payload : undefined;
}

export function isValidMessageType(type: string): type is IntercomMessageType {
  return type === 'text' || type === 'voice' || type === 'location_pin' || type === 'system';
}

export function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
