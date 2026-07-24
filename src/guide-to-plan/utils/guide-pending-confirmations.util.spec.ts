import { buildPendingConfirmations } from './guide-pending-confirmations.util';

describe('buildPendingConfirmations pack hints', () => {
  it('does not require transportMode confirmation (self-drive only)', () => {
    const items = buildPendingConfirmations(
      { countryCode: 'IS' },
      { countryCode: 'IS' },
    );
    expect(items.find((i) => i.field === 'transportMode')).toBeUndefined();
  });

  it('merges pack hints without duplicating fields', () => {
    const items = buildPendingConfirmations(
      { transportMode: 'self_drive', countryCode: 'IS' },
      { countryCode: 'IS' },
      [
        {
          field: 'vehicleType',
          label: '自驾车型',
          reason: 'Pack hint',
          required: false,
        },
      ],
    );
    expect(items.filter((i) => i.field === 'vehicleType')).toHaveLength(1);
    expect(items.find((i) => i.field === 'vehicleType')?.reason).toBe('Pack hint');
  });
});
