import { RouteAndRunContextEnricherService } from './route-and-run-context-enricher.service';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

describe('RouteAndRunContextEnricherService', () => {
  const baseReq = (): RouteAndRunRequestDto =>
    ({
      request_id: 'req-test',
      user_id: 'user-1',
      trip_id: 'trip-uuid-1',
      message: '帮我看看行程',
    }) as RouteAndRunRequestDto;

  it('no-op when context_type is missing', async () => {
    const prisma = { trip: { findUnique: jest.fn() } } as any;
    const svc = new RouteAndRunContextEnricherService(prisma);
    const req = baseReq();
    req.conversation_context = { recent_messages: ['hi'] };
    await svc.maybeInjectActiveTripSummary(req);
    expect(prisma.trip.findUnique).not.toHaveBeenCalled();
    expect(req.conversation_context?.recent_messages).toEqual(['hi']);
  });

  it('no-op when context_type is unknown', async () => {
    const prisma = { trip: { findUnique: jest.fn() } } as any;
    const svc = new RouteAndRunContextEnricherService(prisma);
    const req = baseReq();
    req.conversation_context = { context_type: 'something_else' };
    await svc.maybeInjectActiveTripSummary(req);
    expect(prisma.trip.findUnique).not.toHaveBeenCalled();
  });

  it('no-op when trip_id missing', async () => {
    const prisma = { trip: { findUnique: jest.fn() } } as any;
    const svc = new RouteAndRunContextEnricherService(prisma);
    const req = baseReq();
    req.trip_id = '';
    req.conversation_context = { context_type: 'active_trip_summary' };
    await svc.maybeInjectActiveTripSummary(req);
    expect(prisma.trip.findUnique).not.toHaveBeenCalled();
  });

  it('no-op when Prisma unavailable', async () => {
    const svc = new RouteAndRunContextEnricherService(undefined);
    const req = baseReq();
    req.conversation_context = { context_type: 'active_trip_summary' };
    await svc.maybeInjectActiveTripSummary(req);
    expect(req.conversation_context?.recent_messages).toBeUndefined();
  });

  it('prepends active trip summary when trip exists', async () => {
    const day = new Date('2026-06-01T00:00:00.000Z');
    const findUnique = jest.fn().mockResolvedValue({
      name: '冰岛自驾',
      status: 'PLANNING',
      destination: 'IS',
      startDate: day,
      endDate: day,
      TripDay: [
        {
          date: day,
          ItineraryItem: [
            {
              note: null,
              type: 'ACTIVITY',
              startTime: day,
              endTime: day,
              Place: { nameCN: '蓝湖', nameEN: 'Blue Lagoon' },
            },
          ],
        },
      ],
    });
    const prisma = { trip: { findUnique } } as any;
    const svc = new RouteAndRunContextEnricherService(prisma);
    const req = baseReq();
    req.conversation_context = {
      context_type: 'active_trip_summary',
      recent_messages: ['用户: 可以吗'],
    };
    await svc.maybeInjectActiveTripSummary(req);

    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'trip-uuid-1' }, select: expect.any(Object) });
    const msgs = req.conversation_context?.recent_messages ?? [];
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toContain('[系统注入·当前行程摘要]');
    expect(msgs[0]).toContain('冰岛自驾');
    expect(msgs[0]).toContain('蓝湖');
    expect(msgs[1]).toBe('用户: 可以吗');
  });

  it('falls back to note then type when Place missing', async () => {
    const day = new Date('2026-06-01T00:00:00.000Z');
    const findUnique = jest.fn().mockResolvedValue({
      name: null,
      status: null,
      destination: 'JP',
      startDate: day,
      endDate: day,
      TripDay: [
        {
          date: day,
          ItineraryItem: [{ note: '自定义备注', type: 'TRANSIT', startTime: null, endTime: null, Place: null }],
        },
      ],
    });
    const svc = new RouteAndRunContextEnricherService({ trip: { findUnique } } as any);
    const req = baseReq();
    req.conversation_context = { context_type: 'active_trip_summary' };
    await svc.maybeInjectActiveTripSummary(req);
    expect(req.conversation_context?.recent_messages?.[0]).toContain('自定义备注');
  });

  it('swallows DB errors without throwing', async () => {
    const findUnique = jest.fn().mockRejectedValue(new Error('db down'));
    const svc = new RouteAndRunContextEnricherService({ trip: { findUnique } } as any);
    const req = baseReq();
    req.conversation_context = { context_type: 'active_trip_summary', recent_messages: ['x'] };
    await expect(svc.maybeInjectActiveTripSummary(req)).resolves.toBeUndefined();
    expect(req.conversation_context?.recent_messages).toEqual(['x']);
  });
});
