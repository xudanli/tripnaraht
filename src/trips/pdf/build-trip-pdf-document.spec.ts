import { buildTripPdfDocument } from './build-trip-pdf-document';

describe('buildTripPdfDocument', () => {
  const source = {
    name: '冰岛南岸 7 日',
    destination: '冰岛',
    startDate: '2026-06-01T00:00:00.000Z',
    endDate: '2026-06-03T00:00:00.000Z',
    status: 'PLANNING',
    days: [
      {
        date: '2026-06-02T00:00:00.000Z',
        items: [
          {
            startTime: '2026-06-02T01:00:00.000Z',
            endTime: '2026-06-02T03:00:00.000Z',
            type: 'ACTIVITY',
            note: '沿海岸看瀑布',
            travelFromPreviousDuration: 75,
            travelMode: 'driving',
            estimatedCost: 120,
            currency: 'CNY',
            bookingStatus: 'BOOKED',
            place: {
              nameCN: '塞里雅兰瀑布',
              address: '冰岛南岸',
              category: 'ATTRACTION',
            },
          },
        ],
      },
      {
        date: '2026-06-01T00:00:00.000Z',
        items: [],
      },
    ],
  };

  it('按日期排序，并写出时间、地点和备注', () => {
    const doc = buildTripPdfDocument(source, new Date('2026-05-01T02:00:00.000Z'));

    expect(doc.title).toBe('冰岛南岸 7 日');
    expect(doc.filename).toBe('冰岛南岸 7 日.pdf');
    expect(doc.metaLines).toEqual([
      '目的地：冰岛',
      '日期：2026-06-01 至 2026-06-03',
      '状态：规划中',
      '天数：2 天',
      '导出时间：2026-05-01 10:00',
    ]);
    expect(doc.days.map((day) => day.heading)).toEqual([
      '第 1 天 · 6月1日 星期一',
      '第 2 天 · 6月2日 星期二',
    ]);
    expect(doc.days[0].emptyLabel).toBe('当日暂无安排');
    expect(doc.days[1].items[0]).toMatchObject({
      timeLabel: '09:00-11:00',
      title: '塞里雅兰瀑布',
    });
    expect(doc.days[1].items[0].lines).toEqual(
      expect.arrayContaining([
        '活动 · 景点',
        '冰岛南岸',
        '距上一站 驾车约 1 小时 15 分钟',
        '预估 CNY 120',
        '已预订',
        '沿海岸看瀑布',
      ]),
    );
  });

  it('没有日程时给出空状态', () => {
    const doc = buildTripPdfDocument({
      destination: '京都',
      startDate: '2026-04-01T00:00:00.000Z',
      endDate: '2026-04-02T00:00:00.000Z',
      days: [],
    });
    expect(doc.title).toBe('京都');
    expect(doc.emptyMessage).toBe('这份行程还没有日程。');
    expect(doc.metaLines[2]).toBe('状态：未设置');
  });
});
