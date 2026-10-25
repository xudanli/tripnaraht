import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TripPdfService, canReadTripPdf } from './trip-pdf.service';

jest.mock('./render-trip-pdf', () => ({
  renderTripPdf: jest.fn(async () => Buffer.from('%PDF-1.4')),
}));

describe('canReadTripPdf', () => {
  const trip = {
    metadata: { userId: 'owner-1' },
    TripCollaborator: [{ userId: 'member-1' }],
  };

  it('允许成员、所有者和开发匿名用户', () => {
    expect(canReadTripPdf(trip, 'member-1')).toBe(true);
    expect(canReadTripPdf(trip, 'owner-1')).toBe(true);
    expect(canReadTripPdf(trip, 'anonymous-dev-user')).toBe(true);
    expect(canReadTripPdf(trip, 'stranger')).toBe(false);
  });
});

describe('TripPdfService', () => {
  const trip = {
    id: 'trip-1',
    name: '冰岛',
    destination: '冰岛',
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    endDate: new Date('2026-06-02T00:00:00.000Z'),
    status: 'PLANNING',
    metadata: { userId: 'owner-1' },
    TripCollaborator: [],
    TripDay: [],
  };

  function serviceWith(found: typeof trip | null) {
    const prisma = {
      trip: { findUnique: jest.fn(async () => found) },
    };
    return new TripPdfService(prisma as never);
  }

  it('行程不存在时返回 404', async () => {
    await expect(serviceWith(null).exportPdf('missing', 'owner-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('非成员返回 403', async () => {
    await expect(serviceWith(trip).exportPdf('trip-1', 'stranger')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('成员可以拿到 PDF', async () => {
    const file = await serviceWith(trip).exportPdf('trip-1', 'owner-1');
    expect(file.filename).toBe('冰岛.pdf');
    expect(file.buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
