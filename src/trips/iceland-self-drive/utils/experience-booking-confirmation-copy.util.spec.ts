import { experienceBookingConfirmationMessage } from './experience-booking-confirmation-copy.util';

describe('experienceBookingConfirmationMessage', () => {
  it('uses Þórsmörk product copy (guided experience, not river hard gate)', () => {
    const msg = experienceBookingConfirmationMessage(
      'exp_thorsmork_superjeep',
      'Þórsmörk super jeep',
    );
    expect(msg).toContain('体验增强');
    expect(msg).toContain('硬门禁');
    expect(msg).not.toBe('Þórsmörk super jeep 需要预订核验后才能确认为行程活动');
  });

  it('falls back to generic booking verification line', () => {
    expect(
      experienceBookingConfirmationMessage('exp_unknown', 'Mystery Tour'),
    ).toBe('Mystery Tour 需要预订核验后才能确认为行程活动');
  });
});
