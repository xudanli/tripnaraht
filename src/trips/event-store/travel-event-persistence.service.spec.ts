import { Prisma } from '@prisma/client';
import { TravelEventPersistenceService } from './travel-event-persistence.service';
import {
  TravelEventSource,
  TravelEventType,
  TrajectorySegment,
  type TravelEventEnvelope,
} from './types/travel-event.types';

describe('TravelEventPersistenceService', () => {
  const envelope: TravelEventEnvelope = {
    eventId: 'abc123',
    idempotencyKey: 'trip-1|trip.lifecycle.state_changed|PLANNING|TRAVELING|2026-06-15T12:00:00.000Z|user-1',
    tripId: 'trip-1',
    segment: TrajectorySegment.STATE,
    eventType: TravelEventType.TRIP_LIFECYCLE_STATE_CHANGED,
    source: TravelEventSource.TRIP_LIFECYCLE,
    schemaVersion: 1,
    payload: {
      previousStatus: 'PLANNING',
      newStatus: 'TRAVELING',
    },
    userId: 'user-1',
    timestamp: '2026-06-15T12:00:00.000Z',
  };

  let prisma: { travelEvent: { create: jest.Mock } };
  let service: TravelEventPersistenceService;
  let previousFlag: string | undefined;

  beforeEach(() => {
    previousFlag = process.env.TRAVEL_EVENT_STORE_ENABLED;
    process.env.TRAVEL_EVENT_STORE_ENABLED = 'true';
    prisma = {
      travelEvent: {
        create: jest.fn().mockResolvedValue({ id: envelope.eventId }),
      },
    };
    service = new TravelEventPersistenceService(prisma as any);
  });

  afterEach(() => {
    if (previousFlag === undefined) {
      delete process.env.TRAVEL_EVENT_STORE_ENABLED;
    } else {
      process.env.TRAVEL_EVENT_STORE_ENABLED = previousFlag;
    }
  });

  it('persists event when feature flag is enabled', async () => {
    const result = await service.persist(envelope);

    expect(result).toEqual({
      persisted: true,
      eventId: envelope.eventId,
    });
    expect(prisma.travelEvent.create).toHaveBeenCalledTimes(1);
  });

  it('does not persist when feature flag is disabled', async () => {
    process.env.TRAVEL_EVENT_STORE_ENABLED = 'false';

    const result = await service.persist(envelope);

    expect(result).toEqual({
      persisted: false,
      eventId: envelope.eventId,
    });
    expect(prisma.travelEvent.create).not.toHaveBeenCalled();
  });

  it('treats duplicate idempotency key as non-error duplicate', async () => {
    const duplicateError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: 'test',
      },
    );
    prisma.travelEvent.create.mockRejectedValueOnce(duplicateError);

    const result = await service.persist(envelope);

    expect(result).toEqual({
      persisted: false,
      eventId: envelope.eventId,
      duplicate: true,
    });
  });

  it('fail-open on persistence errors', async () => {
    prisma.travelEvent.create.mockRejectedValueOnce(new Error('db unavailable'));

    const result = await service.persist(envelope);

    expect(result.persisted).toBe(false);
    expect(result.eventId).toBe(envelope.eventId);
    expect(result.error).toBe('db unavailable');
    expect(result.duplicate).toBeUndefined();
  });
});
