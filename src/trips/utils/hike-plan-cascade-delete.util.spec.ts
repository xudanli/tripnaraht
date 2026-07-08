import { cascadeDeleteTripHikePlansIfPresent, cascadeDeleteTripHikePlansWhenTableExists, isMissingHikePlanTableError } from './hike-plan-cascade-delete.util';

describe('hike-plan-cascade-delete.util', () => {
  it('skips delete when hike_plan table probe returns false', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ exists: false }]),
      hikePlan: { findMany: jest.fn(), deleteMany: jest.fn() },
      hikeTrackPoint: { deleteMany: jest.fn() },
    };

    await expect(cascadeDeleteTripHikePlansWhenTableExists(prisma, 'trip-1')).resolves.toBeUndefined();
    expect(prisma.hikePlan.findMany).not.toHaveBeenCalled();
  });

  it('deletes hike plans when table exists', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ exists: true }]),
      hikePlan: {
        findMany: jest.fn().mockResolvedValue([{ id: 'hp-1' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      hikeTrackPoint: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };

    await cascadeDeleteTripHikePlansWhenTableExists(prisma, 'trip-1');

    expect(prisma.hikeTrackPoint.deleteMany).toHaveBeenCalledWith({
      where: { hikePlanId: { in: ['hp-1'] } },
    });
    expect(prisma.hikePlan.deleteMany).toHaveBeenCalledWith({ where: { tripId: 'trip-1' } });
  });

  it('deletes via cascadeDeleteTripHikePlansIfPresent', async () => {
    const client = {
      hikePlan: {
        findMany: jest.fn().mockResolvedValue([{ id: 'hp-1' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      hikeTrackPoint: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };

    await cascadeDeleteTripHikePlansIfPresent(client, 'trip-1');
    expect(client.hikePlan.deleteMany).toHaveBeenCalled();
  });

  it('detects missing table from message', () => {
    expect(
      isMissingHikePlanTableError(new Error('relation "hike_plan" does not exist')),
    ).toBe(true);
  });
});
