import { TimelineOverviewService } from './timeline-overview.service';

describe('TimelineOverviewService loadConflictContext', () => {
  const tripConflicts = {
    getConflicts: jest.fn(),
  };

  const planningConflicts = {
    loadArtifactsFast: jest.fn(),
  };

  let service: TimelineOverviewService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TimelineOverviewService(
      {} as never,
      {} as never,
      {} as never,
      tripConflicts as never,
      {} as never,
      undefined,
      planningConflicts as never,
    );
  });

  it('uses planning-conflicts SSOT total when available', async () => {
    tripConflicts.getConflicts.mockResolvedValue({
      conflicts: [{ id: 'c1' }, { id: 'c2' }],
    });
    planningConflicts.loadArtifactsFast.mockResolvedValue({
      response: { summary: { total: 5 } },
    });

    const ctx = await (service as any).loadConflictContext('trip1');

    expect(ctx.ssotConflictCount).toBe(5);
    expect(ctx.conflictCountSource).toBe('ssot_planning_conflicts');
    expect(ctx.conflicts).toHaveLength(2);
  });

  it('falls back to schedule conflict length when SSOT load fails', async () => {
    tripConflicts.getConflicts.mockResolvedValue({
      conflicts: [{ id: 'c1' }],
    });
    planningConflicts.loadArtifactsFast.mockRejectedValue(new Error('gateway off'));

    const ctx = await (service as any).loadConflictContext('trip1');

    expect(ctx.ssotConflictCount).toBe(1);
    expect(ctx.conflictCountSource).toBe('schedule_conflicts');
  });

  it('uses schedule conflicts when planningConflicts service is absent', async () => {
    const noPlanning = new TimelineOverviewService(
      {} as never,
      {} as never,
      {} as never,
      tripConflicts as never,
      {} as never,
    );
    tripConflicts.getConflicts.mockResolvedValue({
      conflicts: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }],
    });

    const ctx = await (noPlanning as any).loadConflictContext('trip1');

    expect(ctx.ssotConflictCount).toBe(3);
    expect(ctx.conflictCountSource).toBe('schedule_conflicts');
  });
});
