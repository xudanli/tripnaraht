import { Prisma } from '@prisma/client';
import { RuntimeEventOutboxService } from './runtime-event-outbox.service';
import type { TravelEventEnvelope } from '../../trips/event-store/types/travel-event.types';

describe('RuntimeEventOutboxService', () => {
  const prisma = {
    runtimeEventOutbox: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  };

  const persistence = {
    persist: jest.fn(),
  };

  let service: RuntimeEventOutboxService;

  const envelope: TravelEventEnvelope = {
    eventId: 'evt-1',
    idempotencyKey: 'trip-1|gate1.decision.recorded|dec-1',
    tripId: 'trip-1',
    segment: 'decision',
    eventType: 'gate1.decision.recorded',
    source: 'gate1.runtime',
    schemaVersion: 2,
    payload: { gate1ProjectId: 'proj-1', decisionId: 'dec-1' },
    timestamp: '2026-06-25T00:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RUNTIME_EVENT_OUTBOX_ENABLED = 'true';
    service = new RuntimeEventOutboxService(prisma as never, persistence as never);
  });

  it('stages and publishes on success', async () => {
    prisma.runtimeEventOutbox.create.mockResolvedValue({ id: 'outbox-1' });
    prisma.runtimeEventOutbox.findUnique.mockResolvedValue({
      id: 'outbox-1',
      envelope,
      publishAttempts: 0,
      idempotencyKey: envelope.idempotencyKey,
      status: 'PENDING',
    });
    persistence.persist.mockResolvedValue({ persisted: true, eventId: 'evt-1' });
    prisma.runtimeEventOutbox.update.mockResolvedValue({});

    const result = await service.stageAndPublish(envelope, 'proj-1');

    expect(result.persisted).toBe(true);
    expect(prisma.runtimeEventOutbox.create).toHaveBeenCalled();
    expect(persistence.persist).toHaveBeenCalledWith(envelope);
    expect(prisma.runtimeEventOutbox.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'outbox-1' },
        data: expect.objectContaining({ status: 'PUBLISHED' }),
      }),
    );
  });

  it('keeps row pending when persist fails', async () => {
    prisma.runtimeEventOutbox.create.mockResolvedValue({ id: 'outbox-2' });
    prisma.runtimeEventOutbox.findUnique.mockResolvedValue({
      id: 'outbox-2',
      envelope,
      publishAttempts: 0,
      idempotencyKey: envelope.idempotencyKey,
      status: 'PENDING',
    });
    persistence.persist.mockResolvedValue({ persisted: false, eventId: 'evt-2', error: 'db down' });
    prisma.runtimeEventOutbox.update.mockResolvedValue({});

    const result = await service.stageAndPublish(envelope);

    expect(result.persisted).toBe(false);
    expect(prisma.runtimeEventOutbox.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING', publishAttempts: 1 }),
      }),
    );
  });

  it('drains pending rows', async () => {
    prisma.runtimeEventOutbox.findMany.mockResolvedValue([
      {
        id: 'outbox-3',
        envelope,
        publishAttempts: 0,
        idempotencyKey: envelope.idempotencyKey,
      },
    ]);
    persistence.persist.mockResolvedValue({ persisted: true, eventId: 'evt-3' });
    prisma.runtimeEventOutbox.update.mockResolvedValue({});
    prisma.runtimeEventOutbox.count.mockResolvedValue(0);

    const result = await service.drainPending(10);

    expect(result.processed).toBe(1);
    expect(result.published).toBe(1);
    expect(result.stillPending).toBe(0);
  });

  it('returns existing row on duplicate idempotency key', async () => {
    prisma.runtimeEventOutbox.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '5.0.0',
      }),
    );
    prisma.runtimeEventOutbox.findUnique.mockResolvedValue({ id: 'existing-1' });

    const rowId = await service.stage(envelope);
    expect(rowId).toBe('existing-1');
  });
});
