import {
  evaluateCnClassicSeasonWindows,
  monthsCoveredByDateRange,
} from './cn-classic-season-windows.util';

describe('cn-classic-season-windows.util', () => {
  it('covers months across a date range including year boundary', () => {
    expect(monthsCoveredByDateRange('2026-11-20', '2027-02-05')).toEqual([
      11, 12, 1, 2,
    ]);
  });

  it('hits G318 rainy-season risk window in July', () => {
    const hits = evaluateCnClassicSeasonWindows({
      routeId: 'cn.route.g318',
      startDate: '2026-07-01',
      endDate: '2026-07-14',
    });
    expect(hits.some((h) => h.windowId === 'g318_rainy_season')).toBe(true);
    expect(
      hits.find((h) => h.windowId === 'g318_rainy_season')?.overlappingMonths,
    ).toContain(7);
  });

  it('flags Duku outside open window in winter', () => {
    const hits = evaluateCnClassicSeasonWindows({
      routeId: 'cn.route.duku',
      startDate: '2026-12-01',
      endDate: '2026-12-05',
    });
    const duku = hits.find((h) => h.windowId === 'duku_open_season');
    expect(duku?.outsideOpenWindow).toBe(true);
    expect(duku?.severity).toBe('high');
  });

  it('lists all windows when dates omitted (catalog mode)', () => {
    const hits = evaluateCnClassicSeasonWindows({ routeId: 'cn.route.g318' });
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits.every((h) => h.overlappingMonths.length === 0)).toBe(true);
  });
});
