import {
  isExecutableFlightInventoryQuery,
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

  it('resolveFlightInventoryLegs returns null without trip window', () => {
    expect(resolveFlightInventoryLegs('查机票 凯夫拉维克 赫尔辛基 进出', {})).toBeNull();
  });
});
