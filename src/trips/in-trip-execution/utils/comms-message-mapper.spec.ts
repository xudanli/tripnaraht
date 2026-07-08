import { haversineDistanceMeters, isPlausibleCoord } from './comms-haversine.util';
import {
  buildCommsPayload,
  isValidMessageType,
  isValidUuid,
  toIntercomMessageDto,
} from './comms-message-mapper.util';

describe('comms-haversine.util', () => {
  it('computes distance between Reykjavik landmarks', () => {
    const d = haversineDistanceMeters(64.1466, -21.9426, 63.8804, -22.4495);
    expect(d).toBeGreaterThan(30_000);
    expect(d).toBeLessThan(50_000);
  });

  it('validates coordinates', () => {
    expect(isPlausibleCoord(63.88, -22.44)).toBe(true);
    expect(isPlausibleCoord(999, 0)).toBe(false);
  });
});

describe('comms-message-mapper.util', () => {
  it('maps prisma row to dto', () => {
    const dto = toIntercomMessageDto(
      {
        id: 'msg-1',
        tripId: 'trip-1',
        senderId: 'u1',
        clientId: '550e8400-e29b-41d4-a716-446655440000',
        clientSeq: BigInt(1),
        serverSeq: BigInt(10),
        messageType: 'text',
        body: 'hello',
        payload: { metadata: { source: 'test' } },
        clientCreatedAt: new Date('2026-07-16T11:00:00.000Z'),
        serverCreatedAt: new Date('2026-07-16T11:00:01.000Z'),
      },
      'Alice',
    );
    expect(dto.senderDisplayName).toBe('Alice');
    expect(dto.type).toBe('text');
    expect(dto.metadata).toEqual({ source: 'test' });
  });

  it('validates message types and uuids', () => {
    expect(isValidMessageType('text')).toBe(true);
    expect(isValidMessageType('invalid')).toBe(false);
    expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isValidUuid('not-uuid')).toBe(false);
  });

  it('builds optional payload', () => {
    expect(buildCommsPayload({})).toBeUndefined();
    expect(buildCommsPayload({ audio: { durationSec: 3 } })?.audio?.durationSec).toBe(3);
  });
});
