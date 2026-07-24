import { formatClockLabel } from '../../../common/utils/format-clock-label.util';

describe('formatClockLabel (trip-constraint-solver re-export)', () => {
  it('still formats ISO for solver call sites', () => {
    expect(formatClockLabel('2026-07-16T15:44:00.000+00:00')).toBe('15:44');
  });
});
