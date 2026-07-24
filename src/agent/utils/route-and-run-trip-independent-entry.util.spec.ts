import { isTripIndependentRouteAndRunEntry } from './route-and-run-trip-independent-entry.util';

describe('route-and-run-trip-independent-entry', () => {
  it('returns false after Odyssey / Smart Companion product removal', () => {
    expect(
      isTripIndependentRouteAndRunEntry({
        request_id: 'r1',
        user_id: 'u1',
        message: '想找搭子',
        options: { entry_point: 'smart_companion' },
      } as never),
    ).toBe(false);
  });

  it('returns false for generic trip query', () => {
    expect(
      isTripIndependentRouteAndRunEntry({
        request_id: 'r3',
        user_id: 'u1',
        message: '查询我的行程',
      } as never),
    ).toBe(false);
  });
});
