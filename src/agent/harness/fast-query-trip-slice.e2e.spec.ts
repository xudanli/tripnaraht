/**
 * Fast Query × 真实 Trip 形 Prisma mock：切片加载 → 确定性答（CASE-Q01/Q03/Q04）。
 */

import { compileAgentTaskContract } from './compile-agent-task-contract.util';
import { resolveTaskContextSlice } from './resolve-task-context-slice.util';
import type { PrismaService } from '../../prisma/prisma.service';

function mockPrismaTrip(days: Array<{
  date: string;
  items: Array<{
    type: string;
    note?: string;
    order?: number;
    bookingStatus?: string | null;
    nameCN?: string;
    category?: string;
  }>;
}>) {
  return {
    trip: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'trip_real_q',
        destination: 'Iceland',
        destinationCode: 'IS',
        startDate: days[0]?.date,
        TripDay: days.map((d, i) => ({
          id: `day_${i + 1}`,
          date: d.date,
          ItineraryItem: d.items.map((it, j) => ({
            id: `item_${i}_${j}`,
            type: it.type,
            note: it.note ?? null,
            order: it.order ?? j + 1,
            bookingStatus: it.bookingStatus ?? null,
            Place: it.nameCN
              ? { nameCN: it.nameCN, nameEN: it.nameCN, category: it.category ?? null }
              : null,
          })),
        })),
      }),
    },
  } as unknown as PrismaService;
}

describe('Fast Query trip slice e2e (prisma-shaped)', () => {
  const tripDays = [
    {
      date: '2026-06-10',
      items: [
        { type: 'ACTIVITY', nameCN: '蓝湖', bookingStatus: 'CONFIRMED' },
        { type: 'ACTIVITY', nameCN: '雷市漫步', bookingStatus: null },
      ],
    },
    {
      date: '2026-06-11',
      items: [{ type: 'HOTEL', nameCN: '维克旅馆', category: 'HOTEL', bookingStatus: 'CONFIRMED' }],
    },
    {
      date: '2026-06-12',
      items: [{ type: 'ACTIVITY', nameCN: '离境', bookingStatus: 'CONFIRMED' }],
    },
  ];

  it('CASE-Q01: 哪一天没住宿 — load slice + direct answer, skip full summary', async () => {
    const prisma = mockPrismaTrip([
      { date: '2026-06-10', items: [{ type: 'ACTIVITY', nameCN: '抵达' }] },
      { date: '2026-06-11', items: [{ type: 'HOTEL', nameCN: '雷市', category: 'HOTEL' }] },
      { date: '2026-06-12', items: [] },
    ]);
    const contract = compileAgentTaskContract({
      message: '哪一天没住宿',
      turnId: 'e2e-q01',
      tripId: 'trip_real_q',
    });
    expect(contract.scope.contextRegistryKey).toBe('TRIP_QUERY_LODGING');
    expect(contract.allowFullPlanning).toBe(false);

    const slice = await resolveTaskContextSlice({
      prisma,
      tripId: 'trip_real_q',
      contract,
      message: '哪一天没住宿',
    });
    expect(slice?.skipFullTripSummary).toBe(true);
    expect(slice?.directAnswerZh).toContain('Day1');
    expect(slice?.directAnswerZh).toMatch(/缺住宿/);
    expect(slice?.lodgingCoverage?.missingDayNumbers).toEqual([1]);
    expect(prisma.trip.findUnique).toHaveBeenCalled();
  });

  it('CASE-Q03/Q04: today / next with asOf aligned to trip day', async () => {
    const prisma = mockPrismaTrip(tripDays);

    const todayContract = compileAgentTaskContract({
      message: '今天怎么安排',
      turnId: 'e2e-q03',
      tripId: 'trip_real_q',
    });
    const today = await resolveTaskContextSlice({
      prisma,
      tripId: 'trip_real_q',
      contract: todayContract,
      message: '今天怎么安排',
      asOfYmd: '2026-06-10',
    });
    expect(today?.registryKey).toBe('TRIP_QUERY_TODAY');
    expect(today?.directAnswerZh).toContain('蓝湖');
    expect(today?.skipFullTripSummary).toBe(true);

    const nextContract = compileAgentTaskContract({
      message: '下一站是什么',
      turnId: 'e2e-q04',
      tripId: 'trip_real_q',
    });
    const next = await resolveTaskContextSlice({
      prisma,
      tripId: 'trip_real_q',
      contract: nextContract,
      message: '下一站是什么',
      asOfYmd: '2026-06-10',
    });
    expect(next?.directAnswerZh).toContain('雷市漫步');
  });

  it('CASE-G01 shape: TRIP_PLANNING hint cannot force Full Planning on lodging query', async () => {
    const prisma = mockPrismaTrip([
      { date: '2026-07-01', items: [] },
      { date: '2026-07-02', items: [] },
    ]);
    const contract = compileAgentTaskContract({
      message: '哪一天没住宿\n\n[日程] Day1',
      turnId: 'e2e-g01',
      tripId: 'trip_real_q',
      intentModeHint: 'TRIP_PLANNING',
      entryPointHint: 'itinerary_day_editor',
    });
    expect(contract.taskType).toBe('TRIP_QUERY');
    expect(contract.allowFullPlanning).toBe(false);
    const slice = await resolveTaskContextSlice({
      prisma,
      tripId: 'trip_real_q',
      contract,
      message: '哪一天没住宿',
    });
    expect(slice?.directAnswerZh).toBeTruthy();
    expect(slice?.directAnswerZh).not.toMatch(/重排整段|完整规划/);
  });
});
