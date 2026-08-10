import {
  isChinaFlightInventoryScope,
  isExecutableFlightInventoryQuery,
  resolveChinaDomesticFlightCities,
  resolveFlightInventoryLegs,
} from './flight-inventory-signals.util';

describe('flight-inventory-signals', () => {
  it('isExecutableFlightInventoryQuery detects open-jaw KEF/HEL style asks', () => {
    expect(
      isExecutableFlightInventoryQuery(
        '去程凯夫拉维克进、回程从赫尔辛基出，6 月中一周窗口，给可订组合。',
      ),
    ).toBe(true);
  });

  it('isExecutableFlightInventoryQuery detects 订机票 / 城际订票话术', () => {
    expect(isExecutableFlightInventoryQuery('我要订杭州到成都机场的机票')).toBe(true);
    expect(isExecutableFlightInventoryQuery('买一张北京到上海的机票')).toBe(true);
    expect(isExecutableFlightInventoryQuery('成都到拉萨机票')).toBe(true);
  });

  it('resolveFlightInventoryLegs builds two legs for open jaw when trip dates exist', () => {
    const legs = resolveFlightInventoryLegs(
      '去程凯夫拉维克进、回程从赫尔辛基出，6 月中一周窗口，给可订组合。',
      { tripStartYmd: '2026-06-01', tripEndYmd: '2026-06-07' },
    );
    expect(legs).not.toBeNull();
    expect(legs!.length).toBe(2);
    expect(legs![0].destination).toBe('KEF');
    expect(legs![1].origin).toBe('HEL');
    expect(legs![0].departureDate).toBe('2026-06-01');
    expect(legs![1].departureDate).toBe('2026-06-07');
  });

  it('resolveFlightInventoryLegs returns null without trip window for Iceland asks', () => {
    expect(resolveFlightInventoryLegs('查机票 凯夫拉维克 赫尔辛基 进出', {})).toBeNull();
  });

  it('resolveChinaDomesticFlightCities parses 成都到拉萨', () => {
    expect(resolveChinaDomesticFlightCities('成都到拉萨机票')).toEqual({
      originZh: '成都',
      destinationZh: '拉萨',
    });
  });

  it('isChinaFlightInventoryScope true for domestic city pair message', () => {
    expect(
      isChinaFlightInventoryScope({ message: '查一下北京飞上海机票' }),
    ).toBe(true);
  });

  it('resolveFlightInventoryLegs builds China leg without trip dates', () => {
    const legs = resolveFlightInventoryLegs('成都到拉萨机票', {});
    expect(legs).not.toBeNull();
    expect(legs!).toHaveLength(1);
    expect(legs![0].origin).toBe('成都');
    expect(legs![0].destination).toBe('拉萨');
    expect(legs![0].departureDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
