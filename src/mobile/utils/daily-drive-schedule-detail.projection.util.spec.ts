import {
  formatScheduleDurationZh,
  projectScheduleDetailRich,
} from './daily-drive-schedule-detail.projection.util';
import { DAILY_DRIVE_DIMENSION_SCHEMA_IDS } from '../dto/mobile-daily-drive.types';

describe('daily-drive-schedule-detail.projection.util', () => {
  const ctx = {
    localDate: '2026-07-19',
    timezone: 'Atlantic/Reykjavik',
    tripLabelZh: '冰岛自驾',
    dayLabelZh: '第 4 天',
    contextVersion: 1,
    summaryStatus: 'OK' as const,
    summaryDetailZh: '日程正常',
  };

  it('formats duration like the mock', () => {
    expect(formatScheduleDurationZh(35)).toBe('35 分钟');
    expect(formatScheduleDurationZh(100)).toBe('1 小时 40 分');
  });

  it('projects schedule detail aligned to design mock', () => {
    const dto = projectScheduleDetailRich(ctx, {
      nowMinutes: 11 * 60 + 30,
      daylightAttention: true,
      delayMin: 20,
      delayMax: 40,
      items: [
        { time: '09:00', title: '从 Vik 出发', status: 'completed' },
        { time: '10:20', title: '抵达 Skaftafell', status: 'completed' },
        {
          time: '11:00',
          endTime: '13:00',
          title: '徒步/停留',
          status: 'inProgress',
        },
        { time: '15:40', title: '前往 Jökulsárlón', status: 'upcoming' },
        {
          time: '18:10',
          title: '冰川徒步集合',
          status: 'upcoming',
          bookingStatus: 'confirmed',
        },
        {
          time: '21:00',
          title: '入住酒店',
          status: 'upcoming',
          placeCategory: 'HOTEL',
          note: '自助入住，密码锁',
        },
      ],
    });

    expect(dto.schemaId).toBe(DAILY_DRIVE_DIMENSION_SCHEMA_IDS.SCHEDULE);
    expect(dto.hero.titleZh).toContain('仍可');
    expect(dto.hero.detailZh).toMatch(/预计到达/);
    expect(dto.arrivalWindowZh).toMatch(/\d{2}:\d{2}-\d{2}:\d{2}/);
    expect(dto.hero.metaZh).toMatch(/硬时间窗/);

    expect(dto.timeline).toHaveLength(6);
    expect(dto.timeline[0].status).toBe('done');
    expect(dto.timeline[0].statusZh).toBe('已完成');
    expect(dto.timeline[2].timeZh).toBe('11:00-13:00');
    expect(dto.timeline[2].status).toBe('current');
    const hard = dto.timeline.find((t) => t.isHardWindow);
    expect(hard?.titleZh).toContain('集合');
    expect(hard?.status).toBe('hard_window');
    expect(hard?.statusZh).toBe('硬时间窗');

    expect(dto.buffers.map((b) => b.id)).toEqual([
      'OVERALL',
      'TO_NEXT',
      'TO_CHECKIN',
    ]);
    expect(dto.buffers[0].labelZh).toBe('整体缓冲');
    expect(dto.buffers[2].valueZh).toMatch(/小时|分钟/);

    expect(dto.impacts.map((i) => i.id)).toEqual([
      'DRIVE_DELAY',
      'DAYLIGHT',
      'EXECUTABLE',
    ]);
    expect(dto.impacts[0].detailZh).toBe('20-40 分钟');
    expect(dto.impacts[1].statusZh).toBe('注意');
    expect(dto.impacts[2].statusZh).toBe('OK');

    expect(dto.naraSuggestionZh).toMatch(/压缩|缓冲|推进/);
    expect(dto.keyNodes.map((k) => k.id)).toEqual([
      'NEXT_HARD_WINDOW',
      'HOTEL_CHECKIN',
      'SELF_CHECKIN',
    ]);
    expect(dto.keyNodes[0].valueZh).toContain('18:10');
    expect(dto.keyNodes[1].valueZh).toBe('21:00');
    expect(dto.keyNodes[2].valueZh).toBe('有');
    expect(dto.primaryAction?.action).toBe('ADJUST_TODAY');
  });
});
