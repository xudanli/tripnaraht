import { FinancialHoldStoreService } from './financial-hold-store.service';

describe('FinancialHoldStoreService', () => {
  it('expires holds after expires_at (fallback Map when no DB)', async () => {
    jest.useFakeTimers();
    const now = new Date('2026-01-01T00:00:00.000Z').getTime();
    jest.setSystemTime(now);

    const s = new FinancialHoldStoreService();
    await s.upsert({
      hold_id: 'h1',
      action_id: 'a1',
      action_name: 'trip.apply_user_edit',
      trip_id: 't1',
      request_id: 'r1',
      expires_at: new Date(now + 1000).toISOString(),
    });
    expect(await s.get('h1')).toBeTruthy();

    jest.setSystemTime(now + 2000);
    expect(await s.get('h1')).toBeUndefined();
    jest.useRealTimers();
  });

  it('uses Prisma upsert when database is connected', async () => {
    const upsert = jest.fn().mockResolvedValue(undefined);
    const prisma: any = {
      isDbConnected: () => true,
      agentFinancialHold: {
        upsert,
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
      },
    };
    const s = new FinancialHoldStoreService(prisma);
    const exp = new Date('2026-06-01T12:00:00.000Z').toISOString();
    await s.upsert({
      hold_id: 'hold_1',
      action_id: 'act_1',
      action_name: 'trip.apply_user_edit',
      trip_id: 'trip_x',
      request_id: 'req_x',
      expires_at: exp,
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { holdId: 'hold_1' },
        create: expect.objectContaining({
          holdId: 'hold_1',
          tripId: 'trip_x',
        }),
      }),
    );
  });
});

