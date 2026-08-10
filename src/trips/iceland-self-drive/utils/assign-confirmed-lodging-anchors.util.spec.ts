import {
  assignConfirmedLodgingAnchors,
  assignOvernightAnchors,
  mapConfirmedOvernightByDate,
} from './assign-confirmed-lodging-anchors.util';

describe('assignOvernightAnchors', () => {
  it('assigns confirmed lodging endAnchor and next-day startAnchor', () => {
    const days = [
      { date: '2026-07-22' },
      { date: '2026-07-23' },
      { date: '2026-07-24' },
    ];
    assignConfirmedLodgingAnchors(days, [
      { placeId: 381045, label: 'Vík Hostel' },
    ]);
    expect(days[0]!.endAnchor).toEqual(
      expect.objectContaining({
        placeId: 381045,
        nightDate: '2026-07-22',
        source: 'CONFIRMED_BOOKING',
      }),
    );
    expect(days[1]!.startAnchor?.placeId).toBe(381045);
    expect(days[2]!.endAnchor?.source).toBe('CONFIRMED_BOOKING');
  });

  it('prefers nightDate match for confirmed bookings', () => {
    const days = [{ date: '2026-07-22' }, { date: '2026-07-23' }];
    assignOvernightAnchors(days, {
      confirmedLodgings: [
        { placeId: 1, label: 'A', nightDate: '2026-07-23' },
        { placeId: 2, label: 'B', nightDate: '2026-07-22' },
      ],
    });
    expect(days[0]!.endAnchor?.placeId).toBe(2);
    expect(days[1]!.endAnchor?.placeId).toBe(1);
  });

  it('fills gaps with Golden Set soft lodging by pack/region', () => {
    const days = [
      { date: '2026-07-22', packIds: ['south_coast_west'], regionIds: ['south_coast'] },
      { date: '2026-07-23', packIds: ['golden_circle'], regionIds: ['golden_circle'] },
    ];
    assignOvernightAnchors(days, {
      softLodgings: [
        {
          placeId: 381045,
          label: 'Vík Hostel',
          regionId: 'south_coast',
          packId: 'south_coast_west',
        },
        {
          placeId: 381042,
          label: 'Reykjavík overnight',
          regionId: 'golden_circle',
          packId: 'golden_circle',
        },
      ],
    });
    expect(days[0]!.endAnchor).toEqual(
      expect.objectContaining({
        placeId: 381045,
        source: 'GOLDEN_SET_SOFT',
      }),
    );
    expect(days[1]!.endAnchor?.placeId).toBe(381042);
    expect(days[1]!.startAnchor?.placeId).toBe(381045);
  });

  it('confirmed night wins over soft on same date', () => {
    const days = [
      { date: '2026-07-22', packIds: ['south_coast_west'], regionIds: ['south_coast'] },
      { date: '2026-07-23', packIds: ['south_coast_west'], regionIds: ['south_coast'] },
    ];
    assignOvernightAnchors(days, {
      confirmedLodgings: [
        { placeId: 999, label: 'Booked Hotel', nightDate: '2026-07-22' },
      ],
      softLodgings: [
        {
          placeId: 381045,
          label: 'Vík Hostel',
          regionId: 'south_coast',
          packId: 'south_coast_west',
        },
      ],
    });
    expect(days[0]!.endAnchor?.placeId).toBe(999);
    expect(days[0]!.endAnchor?.source).toBe('CONFIRMED_BOOKING');
    expect(days[1]!.endAnchor?.placeId).toBe(381045);
    expect(days[1]!.endAnchor?.source).toBe('GOLDEN_SET_SOFT');
  });

  it('no-ops when both empty', () => {
    const days = [{ date: '2026-07-22' }];
    assignOvernightAnchors(days, {});
    expect(days[0]!.endAnchor).toBeUndefined();
  });
});

describe('mapConfirmedOvernightByDate', () => {
  it('maps end night and next-day morning hotel placeIds', () => {
    const { endByDate, startByDate } = mapConfirmedOvernightByDate(
      ['2026-07-22', '2026-07-23', '2026-07-24'],
      [
        { placeId: 381045, label: 'Vík', nightDate: '2026-07-22' },
        { placeId: 381048, label: 'Glacier', nightDate: '2026-07-23' },
      ],
    );
    expect(endByDate.get('2026-07-22')).toBe(381045);
    expect(endByDate.get('2026-07-23')).toBe(381048);
    expect(startByDate.get('2026-07-23')).toBe(381045);
    expect(startByDate.get('2026-07-24')).toBe(381048);
    expect(startByDate.has('2026-07-22')).toBe(false);
  });
});
