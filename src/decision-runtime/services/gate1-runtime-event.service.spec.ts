import { Gate1RuntimeEventService } from './gate1-runtime-event.service';
import { RuntimeCanonicalEventType } from '../types/runtime-event-catalog';
import { Gate1TravelEventType } from '../types/runtime-event-catalog';

describe('Gate1RuntimeEventService', () => {
  const prisma = {
    gate1Project: {
      findUnique: jest.fn(),
    },
  };

  const persistence = {
    persist: jest.fn(),
  };

  const outbox = {
    stageAndPublish: jest.fn(),
    stage: jest.fn(),
    publishById: jest.fn(),
    isEnabled: jest.fn().mockReturnValue(false),
  };

  let service: Gate1RuntimeEventService;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.RUNTIME_EVENT_OUTBOX_ENABLED;
    service = new Gate1RuntimeEventService(
      prisma as never,
      persistence as never,
      outbox as never,
    );
  });

  it('skips emit when project has no linkedTripId', async () => {
    prisma.gate1Project.findUnique.mockResolvedValue({
      id: 'proj-1',
      linkedTripId: null,
      organizationId: null,
    });

    const result = await service.decisionRecorded({
      projectId: 'proj-1',
      decisionId: 'dec-1',
      materialChange: true,
      actorId: 'advisor-1',
    });

    expect(result).toBeNull();
    expect(persistence.persist).not.toHaveBeenCalled();
  });

  it('persists decision event when linkedTripId is set', async () => {
    prisma.gate1Project.findUnique.mockResolvedValue({
      id: 'proj-1',
      linkedTripId: 'trip-1',
      organizationId: 'org-1',
    });
    persistence.persist.mockResolvedValue({ persisted: true, eventId: 'evt-1' });

    const result = await service.decisionRecorded({
      projectId: 'proj-1',
      decisionId: 'dec-1',
      materialChange: false,
      actorId: 'advisor-1',
    });

    expect(result).toEqual({ persisted: true, eventId: 'evt-1' });
    expect(persistence.persist).toHaveBeenCalledTimes(1);
    const envelope = persistence.persist.mock.calls[0][0];
    expect(envelope.tripId).toBe('trip-1');
    expect(envelope.eventType).toBe(Gate1TravelEventType.DECISION_RECORDED);
    expect(envelope.metadata?.runtime?.canonicalEventType).toBe(
      RuntimeCanonicalEventType.DECISION_RECORDED,
    );
  });

  it('uses outbox when RUNTIME_EVENT_OUTBOX_ENABLED=true', async () => {
    process.env.RUNTIME_EVENT_OUTBOX_ENABLED = 'true';
    prisma.gate1Project.findUnique.mockResolvedValue({
      id: 'proj-1',
      linkedTripId: 'trip-1',
      organizationId: 'org-1',
    });
    outbox.stageAndPublish.mockResolvedValue({ persisted: true, eventId: 'evt-2' });

    const result = await service.decisionRecorded({
      projectId: 'proj-1',
      decisionId: 'dec-2',
      materialChange: true,
      actorId: 'advisor-1',
    });

    expect(result).toEqual({ persisted: true, eventId: 'evt-2' });
    expect(outbox.stageAndPublish).toHaveBeenCalledTimes(1);
    expect(persistence.persist).not.toHaveBeenCalled();
  });

  it('stages in transaction when tx provided (Phase B)', async () => {
    process.env.RUNTIME_EVENT_OUTBOX_ENABLED = 'true';
    const tx = { gate1Project: { findUnique: jest.fn() } };
    tx.gate1Project.findUnique.mockResolvedValue({
      id: 'proj-1',
      linkedTripId: 'trip-1',
      organizationId: null,
    });
    outbox.stage = jest.fn().mockResolvedValue('outbox-tx-1');

    const result = await service.decisionRecorded({
      projectId: 'proj-1',
      decisionId: 'dec-3',
      materialChange: false,
      actorId: 'advisor-1',
      tx: tx as never,
    });

    expect(result).toEqual({ staged: true, outboxId: 'outbox-tx-1' });
    expect(outbox.stage).toHaveBeenCalledTimes(1);
    expect(outbox.stageAndPublish).not.toHaveBeenCalled();
  });

  it('does not emit privateConstraintSummarized unless APPROVED', async () => {
    prisma.gate1Project.findUnique.mockResolvedValue({
      id: 'proj-1',
      linkedTripId: 'trip-1',
      organizationId: null,
    });

    const result = await service.privateConstraintSummarized({
      projectId: 'proj-1',
      sanitizedConstraintId: 'sc-1',
      actorId: 'analyst-1',
      reviewStatus: 'REJECTED',
    });

    expect(result).toBeNull();
    expect(persistence.persist).not.toHaveBeenCalled();
  });
});
