import { ItemType } from '@prisma/client';
import { IcelandSelfDriveBookingAnchorService } from './iceland-self-drive-booking-anchor.service';

describe('IcelandSelfDriveBookingAnchorService', () => {
  it('creates REST/ACTIVITY items with CONFIRMED bookingStatus and hardAnchors', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const prisma = {
      tripDay: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'day-1', date: new Date('2027-02-10T00:00:00.000Z') },
          { id: 'day-2', date: new Date('2027-02-13T00:00:00.000Z') },
        ]),
      },
      place: { findMany: jest.fn().mockResolvedValue([]) },
      itineraryItem: { createMany },
    };

    const svc = new IcelandSelfDriveBookingAnchorService(prisma as never);
    const anchors = await svc.seedAnchors('trip-1', [
      {
        clientId: 'local-1',
        kind: 'lodging',
        name: 'KEX',
        locationText: 'Reykjavík',
        startDate: '2027-02-10',
        endDate: '2027-02-12',
        cancellationPolicy: 'free_cancellation',
      },
      {
        clientId: 'local-2',
        kind: 'activity',
        name: '冰川徒步',
        locationText: 'Sólheimajökull',
        startDate: '2027-02-13',
        durationMinutes: 180,
      },
    ]);

    expect(anchors).toHaveLength(2);
    expect(anchors[0]?.kind).toBe('lodging');
    expect(anchors[0]?.placeId).toBeNull();
    expect(anchors[1]?.kind).toBe('activity');
    expect(createMany).toHaveBeenCalledTimes(1);
    const rows = createMany.mock.calls[0][0].data;
    expect(rows[0].type).toBe(ItemType.REST);
    expect(rows[0].bookingStatus).toBe('CONFIRMED');
    expect(rows[0].placeId).toBeNull();
    expect(rows[0].note).toContain('[hard-anchor:lodging]');
    expect(rows[1].type).toBe(ItemType.ACTIVITY);
    expect(rows[1].bookingStatus).toBe('CONFIRMED');
  });

  it('binds placeId as hard-anchor primary key when provided', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      tripDay: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'day-1', date: new Date('2027-02-10T00:00:00.000Z') },
        ]),
      },
      place: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 4242,
            nameCN: '维克黑沙滩酒店',
            nameEN: 'Vik Black Beach Hotel',
            address: 'Vík',
          },
        ]),
      },
      itineraryItem: { createMany },
    };

    const svc = new IcelandSelfDriveBookingAnchorService(prisma as never);
    const anchors = await svc.seedAnchors('trip-1', [
      {
        clientId: 'local-1',
        kind: 'lodging',
        name: '维克黑沙滩酒店',
        placeId: 4242,
        regionId: 'south_coast',
        startDate: '2027-02-10',
        endDate: '2027-02-11',
      },
    ]);

    expect(anchors[0]?.placeId).toBe(4242);
    expect(anchors[0]?.regionId).toBe('south_coast');
    const row = createMany.mock.calls[0][0].data[0];
    expect(row.placeId).toBe(4242);
    expect(row.note).toContain('placeId=4242');
    expect(row.note).toContain('regionId=south_coast');
  });

  it('returns empty when no bookings', async () => {
    const prisma = {
      tripDay: { findMany: jest.fn() },
      place: { findMany: jest.fn() },
      itineraryItem: { createMany: jest.fn() },
    };
    const svc = new IcelandSelfDriveBookingAnchorService(prisma as never);
    await expect(svc.seedAnchors('trip-1', [])).resolves.toEqual([]);
    expect(prisma.tripDay.findMany).not.toHaveBeenCalled();
  });
});
