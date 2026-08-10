import { participatesInScheduleConflict } from './schedule-conflict-item.util';

describe('participatesInScheduleConflict', () => {
  it('excludes REST lodging', () => {
    expect(participatesInScheduleConflict({ type: 'REST' })).toBe(false);
  });

  it('excludes SUPPLY gas stations', () => {
    expect(
      participatesInScheduleConflict({
        type: 'ACTIVITY',
        Place: { category: 'SUPPLY' },
      }),
    ).toBe(false);
  });

  it('includes attractions', () => {
    expect(
      participatesInScheduleConflict({
        type: 'ACTIVITY',
        Place: { category: 'ATTRACTION' },
      }),
    ).toBe(true);
  });
});
