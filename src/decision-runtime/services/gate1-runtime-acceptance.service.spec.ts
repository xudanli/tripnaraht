import { Gate1RuntimeAcceptanceService } from './gate1-runtime-acceptance.service';

describe('Gate1RuntimeAcceptanceService', () => {
  const prisma = {
    travelEvent: { count: jest.fn(), groupBy: jest.fn() },
  };
  const anchor = {
    getCoverageReport: jest.fn(),
  };
  const reconciliation = {
    reconcileAllLinkedProjects: jest.fn(),
  };
  const outbox = {
    getStats: jest.fn(),
  };

  let service: Gate1RuntimeAcceptanceService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RUNTIME_EVENT_OUTBOX_ENABLED = 'false';
    process.env.TRAVEL_EVENT_STORE_ENABLED = 'true';
    service = new Gate1RuntimeAcceptanceService(
      prisma as never,
      anchor as never,
      reconciliation as never,
      outbox as never,
    );
  });

  it('passes when coverage and reconcile meet thresholds', async () => {
    anchor.getCoverageReport.mockResolvedValue({
      coveragePct: 100,
      totalProjects: 10,
      withLinkedTrip: 10,
      withoutLinkedTrip: 0,
      activeWithoutTrip: 0,
      inactiveWithoutTrip: 0,
    });
    reconciliation.reconcileAllLinkedProjects.mockResolvedValue([
      { allMatched: true, skippedReason: undefined, projectId: 'p1', projectTitle: 'A', entities: [] },
    ]);
    prisma.travelEvent.count.mockResolvedValue(5);
    prisma.travelEvent.groupBy.mockResolvedValue([{ tripId: 't1' }]);

    const report = await service.runAcceptance();
    expect(report.passed).toBe(true);
    expect(report.failures).toHaveLength(0);
  });

  it('fails when reconcile match rate below threshold', async () => {
    anchor.getCoverageReport.mockResolvedValue({
      coveragePct: 100,
      totalProjects: 2,
      withLinkedTrip: 2,
      withoutLinkedTrip: 0,
      activeWithoutTrip: 0,
      inactiveWithoutTrip: 0,
    });
    reconciliation.reconcileAllLinkedProjects.mockResolvedValue([
      { allMatched: true, skippedReason: undefined, projectId: 'p1', projectTitle: 'A', entities: [] },
      {
        allMatched: false,
        skippedReason: undefined,
        projectId: 'p2',
        projectTitle: 'B',
        entities: [{ entity: 'decisions', matched: false }],
      },
    ]);
    prisma.travelEvent.count.mockResolvedValue(1);
    prisma.travelEvent.groupBy.mockResolvedValue([]);

    const report = await service.runAcceptance();
    expect(report.passed).toBe(false);
    expect(report.reconcile.matchRatePct).toBe(50);
    expect(report.failures.some((f) => f.includes('reconcile'))).toBe(true);
  });
});
