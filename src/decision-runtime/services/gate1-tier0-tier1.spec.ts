import { Gate1LinkedTripAnchorService } from './gate1-linked-trip-anchor.service';
import { Gate1TripSyncService } from './gate1-trip-sync.service';
import { TripStatus } from '../../trips/dto/trip-status.dto';

describe('Gate1LinkedTripAnchorService', () => {
  const prisma = {
    gate1Project: { count: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    trustedProjectListing: { findFirst: jest.fn() },
    $transaction: jest.fn(),
    trip: { create: jest.fn() },
    tripCollaborator: { create: jest.fn() },
  };

  let service: Gate1LinkedTripAnchorService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GATE1_LINKED_TRIP_AUTO_CREATE = 'true';
    service = new Gate1LinkedTripAnchorService(prisma as any);
  });

  it('reports coverage', async () => {
    prisma.gate1Project.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(1);

    const report = await service.getCoverageReport();
    expect(report.totalProjects).toBe(10);
    expect(report.withLinkedTrip).toBe(8);
    expect(report.coveragePct).toBe(80);
    expect(report.activeWithoutTrip).toBe(1);
  });

  it('skips backfill when project already has linkedTripId', async () => {
    prisma.gate1Project.findUnique.mockResolvedValue({
      id: 'p1',
      linkedTripId: 'trip-1',
    });

    const result = await service.backfillProject('p1');
    expect(result.action).toBe('skipped_has_trip');
  });

  it('links from listing when available', async () => {
    prisma.gate1Project.findUnique.mockResolvedValue({
      id: 'p1',
      linkedTripId: null,
      advisorUserId: 'adv',
      title: 'Test',
      destination: 'IS',
      startDate: null,
      endDate: null,
    });
    prisma.trustedProjectListing.findFirst.mockResolvedValue({ tripId: 'trip-from-listing' });
    prisma.gate1Project.update.mockResolvedValue({});

    const result = await service.backfillProject('p1');
    expect(result.action).toBe('linked_from_listing');
    expect(result.linkedTripId).toBe('trip-from-listing');
  });
});

describe('Gate1TripSyncService', () => {
  const prisma = {
    gate1Project: { findUnique: jest.fn() },
    trip: { findUnique: jest.fn(), update: jest.fn() },
  };
  const persistence = { persist: jest.fn().mockResolvedValue({ persisted: true }) };

  let service: Gate1TripSyncService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GATE1_TRIP_STATUS_SYNC = 'true';
    service = new Gate1TripSyncService(prisma as any, persistence as any);
  });

  it('syncs trip status from gate1 COLLECTING → FORMING', async () => {
    prisma.gate1Project.findUnique.mockResolvedValue({ linkedTripId: 'trip-1' });
    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-1',
      status: TripStatus.DRAFT,
      metadata: {},
    });
    prisma.trip.update.mockResolvedValue({});

    const result = await service.syncFromGate1Transition({
      projectId: 'p1',
      fromExperimentStatus: 'DRAFT',
      toExperimentStatus: 'COLLECTING',
      actorUserId: 'adv-1',
    });

    expect(result.synced).toBe(true);
    expect(result.newStatus).toBe(TripStatus.FORMING);
    expect(persistence.persist).toHaveBeenCalled();
  });

  it('skips when already aligned', async () => {
    prisma.gate1Project.findUnique.mockResolvedValue({ linkedTripId: 'trip-1' });
    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-1',
      status: TripStatus.PLANNING,
      metadata: {},
    });

    const result = await service.syncFromGate1Transition({
      projectId: 'p1',
      fromExperimentStatus: 'ANALYZING',
      toExperimentStatus: 'READY',
    });

    expect(result.synced).toBe(false);
    expect(result.skippedReason).toBe('ALREADY_ALIGNED');
    expect(persistence.persist).not.toHaveBeenCalled();
  });

  it('skips when sync disabled', async () => {
    process.env.GATE1_TRIP_STATUS_SYNC = 'false';

    const result = await service.syncFromGate1Transition({
      projectId: 'p1',
      fromExperimentStatus: 'DRAFT',
      toExperimentStatus: 'COLLECTING',
    });

    expect(result.skippedReason).toBe('SYNC_DISABLED');
  });
});
