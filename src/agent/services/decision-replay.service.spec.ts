import { DecisionReplayService } from './decision-replay.service';

describe('DecisionReplayService', () => {
  it('supports deterministic snapshot ids via setSnapshotIdFactory', () => {
    const svc = new DecisionReplayService(undefined as any);
    let i = 0;
    svc.setSnapshotIdFactory(() => `snap-fixed-${++i}`);

    const state: any = {
      request_id: 'trip-1',
      current_step: 'INTAKE',
    };

    const a = svc.createSnapshot(state, 'AUTO');
    const b = svc.createSnapshot(state, 'AUTO');

    expect(a.snapshot_id).toBe('snap-fixed-1');
    expect(b.snapshot_id).toBe('snap-fixed-2');
  });

  it('listSessionsForUser filters TripRun by user and optional trip_id', async () => {
    const findManyRuns = jest.fn().mockResolvedValue([
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        tripId: '550e8400-e29b-41d4-a716-446655440002',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        status: 'IN_PROGRESS',
        userQuery: '帮我规划东京三日行程',
        planningPhase: 'PLANNING',
        completedAt: null,
      },
    ]);
    const findManyTrips = jest.fn().mockResolvedValue([
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        name: '东京之旅',
        destination: 'Tokyo',
      },
    ]);
    const prisma = { tripRun: { findMany: findManyRuns }, trip: { findMany: findManyTrips } } as any;
    const svc = new DecisionReplayService(prisma);
    const out = await svc.listSessionsForUser('user-uuid', '550e8400-e29b-41d4-a716-446655440002');
    expect(findManyRuns).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-uuid', tripId: '550e8400-e29b-41d4-a716-446655440002' },
      }),
    );
    expect(findManyTrips).toHaveBeenCalledWith({
      where: { id: { in: ['550e8400-e29b-41d4-a716-446655440002'] } },
      select: { id: true, name: true, destination: true },
    });
    expect(out[0].session_id).toBe('550e8400-e29b-41d4-a716-446655440001');
    expect(out[0].trip_run_id).toBe('550e8400-e29b-41d4-a716-446655440001');
    expect(out[0].created_at).toBe('2026-01-02T00:00:00.000Z');
    expect(out[0].trip_display_name).toBe('东京之旅');
    expect(out[0].trip_destination).toBe('Tokyo');
    expect(out[0].user_query_preview).toBe('帮我规划东京三日行程');
    expect(out[0].status_label_zh).toBe('进行中');
    expect(out[0].list_summary).toContain('进行中');
    expect(out[0].list_summary).toContain('帮我规划东京三日行程');
  });
});

